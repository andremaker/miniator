// Node-API addon for scene-neutral shared-memory tile extraction and
// compilation-time pixel scanning. No HTML, scene coordinates, colors, or text.
#include <node_api.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <string>
#include <cstdint>
#include <algorithm>
struct Pool {uint8_t* base; size_t capacity; size_t count; int fd;};
static void finalize(napi_env,void* data,void*) {
 auto* p=(Pool*)data;if(p){if(p->base)munmap(p->base,p->capacity*p->count);if(p->fd>=0)close(p->fd);delete p;}
}
static void chk(napi_env env,napi_status s){if(s!=napi_ok){const napi_extended_error_info* e; napi_get_last_error_info(env,&e);napi_throw_error(env,nullptr,e?e->error_message:"NAPI failure");}}
static uint32_t u32(napi_env env,napi_value val){uint32_t n=0;chk(env,napi_get_value_uint32(env,val,&n));return n;}
static napi_value openPool(napi_env env,napi_callback_info cb){
 size_t argc=3;napi_value a[3];chk(env,napi_get_cb_info(env,cb,&argc,a,nullptr,nullptr));
 size_t slen=0;chk(env,napi_get_value_string_utf8(env,a[0],nullptr,0,&slen));std::string name(slen+1,0);
 chk(env,napi_get_value_string_utf8(env,a[0],name.data(),name.size(),&slen));name.resize(slen);
 uint32_t cap=u32(env,a[1]),count=u32(env,a[2]);
 if(!cap||!count){napi_throw_error(env,nullptr,"Invalid frame pool size");return nullptr;}
 auto* p=new Pool();p->fd=shm_open(name.c_str(),O_RDONLY,0);p->capacity=cap;p->count=count;
 if(p->fd<0){delete p;napi_throw_error(env,nullptr,"shm_open failed");return nullptr;}
 void* mapped=mmap(nullptr,size_t(cap)*count,PROT_READ,MAP_SHARED,p->fd,0);
 if(mapped==MAP_FAILED){close(p->fd);delete p;napi_throw_error(env,nullptr,"mmap failed");return nullptr;}
 p->base=(uint8_t*)mapped;napi_value out;chk(env,napi_create_external(env,p,finalize,nullptr,&out));return out;
}
static napi_value closePool(napi_env env,napi_callback_info cb){
 size_t argc=1;napi_value a[1];chk(env,napi_get_cb_info(env,cb,&argc,a,nullptr,nullptr));
 Pool* p=nullptr;chk(env,napi_get_value_external(env,a[0],(void**)&p));
 if(p&&p->base){munmap(p->base,p->capacity*p->count);p->base=nullptr;}
 if(p&&p->fd>=0){close(p->fd);p->fd=-1;}
 napi_value val;chk(env,napi_get_undefined(env,&val));return val;
}
// Copy only the requested tile from Chromium's POSIX frame pool to a packed
// BGRA buffer. Avoids reading the entire atlas through Node into JavaScript.
// Copy happens before Page.remotionReleaseFrame, while the SHM pixels are valid.
static napi_value extractTile(napi_env env,napi_callback_info cb){
 size_t argc=9;napi_value a[9];chk(env,napi_get_cb_info(env,cb,&argc,a,nullptr,nullptr));
 if(argc!=9){napi_throw_error(env,nullptr,"extractTile: expected 9 args");return nullptr;}
 Pool* pool=nullptr;chk(env,napi_get_value_external(env,a[0],(void**)&pool));
 uint32_t shmSlot=u32(env,a[1]),aw=u32(env,a[2]),ah=u32(env,a[3]),stride=u32(env,a[4]);
 uint32_t tile=u32(env,a[5]),cw=u32(env,a[6]),ch=u32(env,a[7]),sy=u32(env,a[8]);
 if(!pool||!pool->base||shmSlot>=pool->count||aw>32768||ah>16384||!aw||!ah||!cw||!ch||
    stride<aw*4||size_t(stride)*ah>pool->capacity||size_t(tile+1)*cw>aw||sy+ch>ah){
   napi_throw_error(env,nullptr,"Invalid tile geometry");return nullptr;
 }
 napi_value result;uint8_t* dest=nullptr;
 chk(env,napi_create_buffer(env,size_t(cw)*ch*4,(void**)&dest,&result));
 const uint8_t* src=pool->base+size_t(shmSlot)*pool->capacity;
 for(uint32_t row=0;row<ch;row++){
  memcpy(dest+size_t(row)*cw*4, src+size_t(row+sy)*stride+size_t(tile)*cw*4,size_t(cw)*4);
 }
 return result;
}

static napi_value extractTileGrid(napi_env env,napi_callback_info cb){
 size_t argc=10;napi_value a[10];chk(env,napi_get_cb_info(env,cb,&argc,a,nullptr,nullptr));
 if(argc!=10){napi_throw_error(env,nullptr,"extractTileGrid: expected 10 args");return nullptr;}
 Pool* pool=nullptr;chk(env,napi_get_value_external(env,a[0],(void**)&pool));
 uint32_t shmSlot=u32(env,a[1]),aw=u32(env,a[2]),ah=u32(env,a[3]),stride=u32(env,a[4]);
 uint32_t tile=u32(env,a[5]),cw=u32(env,a[6]),ch=u32(env,a[7]),sy=u32(env,a[8]),columns=u32(env,a[9]);
 uint32_t px=columns?(tile%columns)*cw:0, py=columns?(tile/columns)*ch:0;
 if(!pool||!pool->base||shmSlot>=pool->count||aw>32768||ah>16384||!aw||!ah||!cw||!ch||
    stride<aw*4||size_t(stride)*ah>pool->capacity||!columns||px+cw>aw||py+sy+ch>ah){
   napi_throw_error(env,nullptr,"Invalid tile geometry");return nullptr;
 }
 napi_value result;uint8_t* dest=nullptr;
 chk(env,napi_create_buffer(env,size_t(cw)*ch*4,(void**)&dest,&result));
 const uint8_t* src=pool->base+size_t(shmSlot)*pool->capacity;
 for(uint32_t row=0;row<ch;row++){
  memcpy(dest+size_t(row)*cw*4, src+size_t(row+sy+py)*stride+size_t(px)*4,size_t(cw)*4);
 }
 return result;
}


// Returns a BGRA frame or only its changed rectangle, avoiding RGB conversion.
// cropOnly is explicitly scene-aware; an FFmpeg pad restores the constant background.
// Pre-compilation only: examine the original Chromium full-frame output while
// the shared-memory slot is owned. Find the exact bounding box of pixels
// differing from the sampled solid background. Never used on the render hot path.
static napi_value inspectFrame(napi_env env,napi_callback_info cb){
 size_t argc=5;napi_value a[5];chk(env,napi_get_cb_info(env,cb,&argc,a,nullptr,nullptr));
 if(argc!=5){napi_throw_error(env,nullptr,"inspectFrame: expected 5 args");return nullptr;}
 Pool* pool=nullptr;chk(env,napi_get_value_external(env,a[0],(void**)&pool));
 uint32_t slot=u32(env,a[1]),w=u32(env,a[2]),h=u32(env,a[3]),stride=u32(env,a[4]);
 if(!pool||!pool->base||slot>=pool->count||w<1||w>8192||h<1||h>8192||stride<w*4||size_t(stride)*h>pool->capacity){
  napi_throw_error(env,nullptr,"Invalid full-frame mapped geometry");return nullptr;
 }
 const uint8_t *frame=pool->base+size_t(slot)*pool->capacity;
 const uint32_t bg=uint32_t(frame[0])|(uint32_t(frame[1])<<8)|(uint32_t(frame[2])<<16)|(uint32_t(frame[3])<<24);
 uint32_t xlo=w,ylo=h,xhi=0,yhi=0;size_t altered=0;
 for(uint32_t y=0;y<h;y++){
  const uint8_t* row=frame+size_t(y)*stride;
  for(uint32_t x=0;x<w;x++){
   const uint8_t *p=row+size_t(x)*4;
   const uint32_t pixel=uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);
   if(pixel!=bg){xlo=std::min(xlo,x);ylo=std::min(ylo,y);xhi=std::max(xhi,x);yhi=std::max(yhi,y);altered++;}
  }
 }
 napi_value out,val;chk(env,napi_create_object(env,&out));
 auto num=[&](const char* key,double n){chk(env,napi_create_double(env,n,&val));chk(env,napi_set_named_property(env,out,key,val));};
 num("x",altered?xlo:0);num("y",altered?ylo:0);num("width",altered?xhi-xlo+1:0);num("height",altered?yhi-ylo+1:0);
 num("changed_pixels",double(altered));num("background_bgra",double(bg));
 return out;
}
static napi_value Init(napi_env env,napi_value exports){
 napi_property_descriptor desc[]={
 {"openPool",nullptr,openPool,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"closePool",nullptr,closePool,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"extractTile",nullptr,extractTile,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"extractTileGrid",nullptr,extractTileGrid,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"inspectFrame",nullptr,inspectFrame,nullptr,nullptr,nullptr,napi_default,nullptr}
 };chk(env,napi_define_properties(env,exports,5,desc));return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
