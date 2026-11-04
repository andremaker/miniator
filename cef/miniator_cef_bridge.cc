// Miniator CEF-only off-screen capture bridge. CEF is an external build dependency.
// Frame correlation is enforced using a reserved, out-of-frame marker column.
#include <fcntl.h>
#include <poll.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_devtools_message_observer.h"
#include "include/cef_load_handler.h"
#include "include/cef_parser.h"
#include "include/cef_render_handler.h"
#include "include/cef_values.h"
#include "include/cef_version.h"

namespace {
std::string Serialize(CefRefPtr<CefValue> x) { return CefWriteJSON(x, JSON_WRITER_DEFAULT).ToString(); }
std::string Quote(const std::string& s) {
  auto v=CefValue::Create();v->SetString(s);return Serialize(v);
}
CefRefPtr<CefDictionaryValue> Parse(const std::string& s){
  auto v=CefParseJSON(s, JSON_PARSER_RFC);
  return v&&v->GetType()==VTYPE_DICTIONARY?v->GetDictionary():nullptr;
}
std::string Field(CefRefPtr<CefDictionaryValue> d, const char* key){
  return d&&d->HasKey(key)&&d->GetType(key)==VTYPE_STRING?d->GetString(key).ToString():"";
}
int Number(CefRefPtr<CefDictionaryValue> d, const char* key, int fallback=0){
  return d&&d->HasKey(key)&&d->GetType(key)==VTYPE_INT?d->GetInt(key):fallback;
}
class Bridge;
class Tab final : public CefClient,
                  public CefLifeSpanHandler,
                  public CefRenderHandler,
                  public CefLoadHandler,
                  public CefDevToolsMessageObserver {
 public:
  Tab(Bridge* owner, std::string target, int request, int width, int height)
      : owner_(owner), target_(std::move(target)), create_request_(request),width_(width),height_(height){}
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override {return this;}
  CefRefPtr<CefRenderHandler> GetRenderHandler() override {return this;}
  CefRefPtr<CefLoadHandler> GetLoadHandler() override {return this;}
  void GetViewRect(CefRefPtr<CefBrowser>, CefRect& rect) override {rect=CefRect(0,0,width_,height_);}
  void OnAfterCreated(CefRefPtr<CefBrowser> browser) override;
  void OnBeforeClose(CefRefPtr<CefBrowser>) override;
  void OnLoadEnd(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame>,int) override;
  void OnLoadError(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame>,ErrorCode,const CefString&,const CefString&) override;
  void OnDevToolsMethodResult(CefRefPtr<CefBrowser>,int,bool,const void*,size_t) override;
  void OnPaint(CefRefPtr<CefBrowser>,PaintElementType,const RectList&,const void*,int,int) override;
  CefRefPtr<CefBrowser> browser() const {return browser_;}
  const std::string& target() const {return target_;}
  int width() const {return width_;} int height() const {return height_;}
  void Resize(int w,int h){width_=w;height_=h;if(browser_)browser_->GetHost()->WasResized();}
  void SetContent(int id,const std::string& html);
  void CreatePool(int id,int capacity,int slots);
  void Capture(int id,const std::string& frame_id,int expected_marker);
  void Tick();
  void Release(int id){/* the read-only consumer finishes before acknowledging */ Reply(id,"{}");}
  void DestroyPool(int id){ClosePool();Reply(id,"{}");}
  void ClosePool();
  void Reply(int id,const std::string& payload);
  void Error(int id,const std::string& message);
  IMPLEMENT_REFCOUNTING(Tab);
 private:
  Bridge* owner_;
  std::string target_;
  CefRefPtr<CefBrowser> browser_;
  CefRefPtr<CefRegistration> devtools_registration_;
  int create_request_=0, pending_content_id_=0, pending_capture_id_=0;
  std::string pending_frame_id_;
  int expected_marker_=0;
  std::chrono::steady_clock::time_point capture_started_;
  std::chrono::steady_clock::time_point invalidated_at_;
  int capture_retries_ = 0;
  bool injected_suppression_done_=false, suppress_active_capture_=false;
  int width_,height_;
  std::string shm_name_;
  int shm_fd_=-1, shm_capacity_=0, shm_slots_=0;
  unsigned char* shm_data_=nullptr;
  size_t shm_bytes_=0;
};
class Bridge {
 public:
  void Reply(int id,const std::string& json){
    // CEF and stdin command polling both run on the same UI thread.
    std::cout << "{\"id\":" << id << ",\"result\":" << json << "}" << std::endl;
  }
  void Error(int id,const std::string& s){
    std::cout << "{\"id\":" << id << ",\"error\":{\"message\":" << Quote(s) << "}}" << std::endl;
  }
  void Handle(const std::string& line){
    auto cmd=Parse(line);if(!cmd)return;
    const int id=Number(cmd,"id");
    if(id<1)return;
    const auto method=Field(cmd,"method");
    auto p=cmd->GetDictionary("params");if(!p)p=CefDictionaryValue::Create();
    if(method=="Browser.close") {Reply(id,"{}");CloseAll();return;}
    if(method=="Target.createTarget"){
      const int w=Number(p,"width",800),h=Number(p,"height",600);
      if(w<1||w>32768||h<1||h>16384||static_cast<size_t>(w)*h>100000000){Error(id,"Invalid CEF viewport");return;}
      auto target="cef-"+std::to_string(++next_target_);
      CefRefPtr<Tab> tab=new Tab(this,target,id,w,h);
      tabs_[target]=tab;
      CefWindowInfo window;window.SetAsWindowless(kNullWindowHandle);window.external_begin_frame_enabled=true;
      CefBrowserSettings settings;
      auto browser=CefBrowserHost::CreateBrowserSync(window,tab,"about:blank",settings,nullptr,nullptr);
      if(!browser){tabs_.erase(target);Error(id,"CEF CreateBrowserSync failed");}
      return;
    }
    if(method=="Target.attachToTarget"){
      const auto target=Field(p,"targetId");
      if(!tabs_.count(target)){Error(id,"Unknown CEF target");return;}
      Reply(id,"{\"sessionId\":"+Quote(target)+"}");return;
    }
    if(method=="Target.closeTarget"){
      auto it=tabs_.find(Field(p,"targetId"));
      if(it!=tabs_.end()){auto tab=it->second;tabs_.erase(it);tab->ClosePool();if(tab->browser())tab->browser()->GetHost()->CloseBrowser(true);}
      Reply(id,"{\"success\":true}");return;
    }
    const auto sid=Field(cmd,"sessionId");
    auto it=tabs_.find(sid);
    if(it==tabs_.end()){Error(id,"Unknown CEF session: "+sid);return;}
    auto t=it->second;
    if(method=="Page.enable"||method=="Runtime.enable") {Reply(id,"{}");return;}
    if(method=="Page.getFrameTree"){
      Reply(id,"{\"frameTree\":{\"frame\":{\"id\":"+Quote("frame-"+sid)+"}}}");return;
    }
    if(method=="Emulation.setDeviceMetricsOverride") {
      int w=Number(p,"width"),h=Number(p,"height");
      if(w<1||h<1||w>32768||h>16384){Error(id,"Invalid resized viewport");return;}
      t->Resize(w,h);Reply(id,"{}");return;
    }
    if(method=="Page.setDocumentContent") {t->SetContent(id,Field(p,"html"));return;}
    if(method=="Page.miniatorCreateFramePool") {
      if(Field(p,"preferredBackend")!="posix-shm"){Error(id,"Only posix-shm supported");return;}
      t->CreatePool(id,Number(p,"slotCapacity"),Number(p,"slotCount"));return;
    }
    if(method=="Page.miniatorDestroyFramePool"){t->DestroyPool(id);return;}
    if(method=="Page.miniatorReleaseFrame"){t->Release(id);return;}
    if(method=="Page.captureScreenshot"){
      if(p->HasKey("miniatorCopyCurrentSurface")&&p->GetBool("miniatorCopyCurrentSurface")){
        Error(id,"Unsafe copy-current-surface unavailable in CEF");return;
      }
      t->Capture(id,Field(p,"miniatorFrameId"),Number(p,"miniatorExpectedMarker"));return;
    }
    if(!t->browser()){Error(id,"CEF browser not yet initialized");return;}
    // Normal Chromium DevTools commands, including Runtime.evaluate. Replies
    // arrive in Tab::OnDevToolsMethodResult and preserve the original request ID.
    if(!t->browser()->GetHost()->ExecuteDevToolsMethod(id,method,p))
      Error(id,"CEF DevTools command was rejected: "+method);
  }
  void Tick(){for(auto& [_,tab]:tabs_)tab->Tick();}
  bool closing() const{return closing_;}
  bool no_tabs() const{return tabs_.empty();}
  void CloseAll(){closing_=true;std::vector<CefRefPtr<Tab>> snapshot;for(auto& [_,t]:tabs_)snapshot.push_back(t);for(auto& t:snapshot)if(t->browser())t->browser()->GetHost()->CloseBrowser(true);}
  void OnClosed(const std::string& s){tabs_.erase(s);}
 private:
  std::map<std::string,CefRefPtr<Tab>> tabs_;
  int next_target_=0;
  bool closing_=false;
};
void Tab::Reply(int id,const std::string& json){owner_->Reply(id,json);}
void Tab::Error(int id,const std::string& s){owner_->Error(id,s);}
void Tab::OnAfterCreated(CefRefPtr<CefBrowser> browser){
  browser_=browser;
  devtools_registration_=browser->GetHost()->AddDevToolsMessageObserver(this);
  if(create_request_){Reply(create_request_,"{\"targetId\":"+Quote(target_)+"}");create_request_=0;}
}
void Tab::OnBeforeClose(CefRefPtr<CefBrowser>){
  ClosePool();devtools_registration_=nullptr;browser_=nullptr;
  owner_->OnClosed(target_);
}
void Tab::OnLoadEnd(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> frame,int){
  if(!pending_content_id_||!frame->IsMain())return;
  if(frame->GetURL().ToString().rfind("data:text/html",0)!=0)return;
  int id=pending_content_id_;pending_content_id_=0;Reply(id,"{}");
}
void Tab::OnLoadError(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> frame,ErrorCode err,const CefString&,const CefString&){
  if(pending_content_id_&&frame->IsMain()&&err!=ERR_ABORTED){auto id=pending_content_id_;pending_content_id_=0;Error(id,"CEF document load error "+std::to_string(err));}
}
void Tab::SetContent(int id,const std::string& html){
  if(!browser_){Error(id,"Browser not created");return;}
  if(pending_content_id_){Error(id,"Document navigation in progress");return;}
  pending_content_id_=id;
  const auto encoded=CefBase64Encode(html.data(),html.size()).ToString();
  browser_->GetMainFrame()->LoadURL("data:text/html;charset=utf-8;base64,"+encoded);
}
void Tab::OnDevToolsMethodResult(CefRefPtr<CefBrowser>,int id,bool success,const void* data,size_t size){
  std::string payload=data&&size?std::string(static_cast<const char*>(data),size):"{}";
  if(success)Reply(id,payload);else Error(id,"DevTools: "+payload);
}
void Tab::ClosePool(){
  if(pending_capture_id_){int id=pending_capture_id_;pending_capture_id_=0;pending_frame_id_.clear();expected_marker_=0;Error(id,"Capture canceled: pool closed");}
  if(shm_data_){munmap(shm_data_,shm_bytes_);shm_data_=nullptr;}
  if(shm_fd_>=0){close(shm_fd_);shm_fd_=-1;}
  if(!shm_name_.empty()){shm_unlink(shm_name_.c_str());shm_name_.clear();}
  shm_bytes_=0;shm_capacity_=0;shm_slots_=0;
}
void Tab::CreatePool(int id,int capacity,int slots){
  if(capacity<1||slots<1||slots>8||static_cast<size_t>(capacity)*slots>512ull*1024*1024||
     static_cast<size_t>(width_)*height_*4>static_cast<size_t>(capacity)){
    Error(id,"CEF frame pool capacity insufficient or too large");return;
  }
  ClosePool();shm_capacity_=capacity;shm_slots_=slots;
  shm_name_="/miniator-cef-"+std::to_string(getpid())+"-"+target_;
  shm_bytes_=static_cast<size_t>(capacity)*slots;
  shm_fd_=shm_open(shm_name_.c_str(),O_RDWR|O_CREAT|O_EXCL,0600);
  if(shm_fd_<0){const auto e=errno;shm_name_.clear();Error(id,"shm_open failed: "+std::to_string(e));return;}
  if(ftruncate(shm_fd_,shm_bytes_)<0){ClosePool();Error(id,"ftruncate failed");return;}
  void* mapped=mmap(nullptr,shm_bytes_,PROT_READ|PROT_WRITE,MAP_SHARED,shm_fd_,0);
  if(mapped==MAP_FAILED){ClosePool();Error(id,"mmap failed");return;}
  shm_data_=static_cast<unsigned char*>(mapped);
  Reply(id,"{\"backend\":\"posix-shm\",\"sharedMemoryName\":"+Quote(shm_name_)+
    ",\"slotCapacity\":"+std::to_string(capacity)+",\"slotCount\":"+std::to_string(slots)+"}");
}
void Tab::Capture(int id,const std::string& frame_id,int expected_marker){
  if(!shm_data_){Error(id,"CEF frame pool not created");return;}
  if(pending_capture_id_){Error(id,"Previous frame capture pending");return;}
  if(!browser_){Error(id,"Browser not created");return;}
  pending_capture_id_=id;pending_frame_id_=frame_id;expected_marker_=expected_marker;
  capture_started_=invalidated_at_=std::chrono::steady_clock::now();capture_retries_=0;
  suppress_active_capture_ = std::getenv("MINIATOR_CEF_TEST_SUPPRESS_FIRST_CAPTURE") && !injected_suppression_done_;
  if(suppress_active_capture_) injected_suppression_done_=true;
  browser_->GetHost()->Invalidate(PET_VIEW);browser_->GetHost()->SendExternalBeginFrame();
}
void Tab::Tick(){
  if(!pending_capture_id_ || !browser_)return;
  using namespace std::chrono;
  const auto now=steady_clock::now();
  const auto total=duration_cast<milliseconds>(now-capture_started_).count();
  if(total>=4000){
    suppress_active_capture_=false;
    const int id=pending_capture_id_;pending_capture_id_=0;pending_frame_id_.clear();expected_marker_=0;
    Error(id,"CEF OnPaint timeout after 4000ms; invalidations="+std::to_string(capture_retries_+1));
    return;
  }
  if(true &&
     duration_cast<milliseconds>(now-invalidated_at_).count()>=16){
    browser_->GetHost()->Invalidate(PET_VIEW);browser_->GetHost()->SendExternalBeginFrame();
    capture_retries_++;
    invalidated_at_=now;
    if(capture_retries_==1)std::cerr<<"CEF retry waiting for OnPaint target="<<target_<<" age_ms="<<total<<"\n";
  }
}
void Tab::OnPaint(CefRefPtr<CefBrowser>,PaintElementType type,const RectList&,const void* buffer,int width,int height){
  if(type!=PET_VIEW||!pending_capture_id_||!shm_data_||!buffer||suppress_active_capture_)return;
  if(width!=width_||height!=height_)return; // never mix viewport generations
  if(expected_marker_){
    const auto* pixel=static_cast<const unsigned char*>(buffer)+
      ((static_cast<size_t>(height)-1)*width+(width-1))*4;
    const int actual=pixel[2]|(pixel[1]<<8)|(pixel[0]<<16);
    if(actual!=expected_marker_)return;
  }
  const size_t bytes=static_cast<size_t>(width)*height*4;
  if(bytes>static_cast<size_t>(shm_capacity_)){
    const int id=pending_capture_id_;pending_capture_id_=0;Error(id,"Capture exceeds allocated POSIX SHM slot");return;
  }
  // One full BGRA frame into the established read-only Node native mmap.
  std::memcpy(shm_data_,buffer,bytes);
  // The correlation pixel is outside the video atlas and is never extracted.
  const int id=pending_capture_id_;pending_capture_id_=0;
  Reply(id,"{\"miniatorFrame\":{\"slot\":0,\"stride\":"+std::to_string(width*4)+
    ",\"width\":"+std::to_string(width)+",\"height\":"+std::to_string(height)+
    ",\"frameId\":"+Quote(pending_frame_id_)+"}}");
  pending_frame_id_.clear();expected_marker_=0;
}
} // namespace

int main(int argc,char** argv){
  CefMainArgs main_args(argc,argv);
  const int subprocess_exit=CefExecuteProcess(main_args,nullptr,nullptr);
  if(subprocess_exit>=0)return subprocess_exit;
  CefSettings settings;settings.no_sandbox=true;settings.windowless_rendering_enabled=true;
  settings.log_severity=LOGSEVERITY_ERROR;
  settings.multi_threaded_message_loop=false;
  // CEF browser processes must never share a profile lock. Separate root/cache
  // directories allow independently launched render workers and parallel tests.
  char cache_template[] = "/tmp/miniator-cef-profile-XXXXXX";
  const char* cache_root = mkdtemp(cache_template);
  if(!cache_root){std::cerr << "Unable to create CEF profile directory\n";return 2;}
  CefString(&settings.root_cache_path)=cache_root;
  CefString(&settings.cache_path)=cache_root;
  if(!CefInitialize(main_args,settings,nullptr,nullptr))return 2;
  // STDIN is never read by the CEF subprocesses. Browser UI work and JSON
  // control requests are interleaved on the same thread.
  fcntl(STDIN_FILENO,F_SETFL,fcntl(STDIN_FILENO,F_GETFL,0)|O_NONBLOCK);
  Bridge bridge;
  std::cout << "{\"event\":\"ready\",\"protocol\":1,\"version\":" << Quote(CEF_VERSION) << "}" << std::endl;
  std::string input;
  bool eof=false;
  while(!eof && !(bridge.closing()&&bridge.no_tabs())){
    CefDoMessageLoopWork();
    bridge.Tick();
    char buf[65536];
    const auto n=read(STDIN_FILENO,buf,sizeof(buf));
    if(n>0){input.append(buf,n);while(true){auto end=input.find('\n');if(end==std::string::npos)break;
      std::string line=input.substr(0,end);input.erase(0,end+1);bridge.Handle(line);}
      if(input.size()>16*1024*1024){std::cerr<<"CEF bridge command too large\n";break;}
    }else if(n==0){eof=true;}else if(errno!=EAGAIN&&errno!=EINTR){eof=true;}
    poll(nullptr,0,5);
  }
  if(!bridge.no_tabs()){bridge.CloseAll();for(int i=0;i<400&&!bridge.no_tabs();++i){CefDoMessageLoopWork();poll(nullptr,0,5);}}
  CefShutdown();
  std::error_code cleanup_error;
  std::filesystem::remove_all(cache_root,cleanup_error);
  return 0;
}
