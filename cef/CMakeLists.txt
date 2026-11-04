cmake_minimum_required(VERSION 3.21)
project(miniator_cef_bridge LANGUAGES C CXX)
if(NOT UNIX OR APPLE)
  message(FATAL_ERROR "This Miniator CEF prototype currently supports Linux only")
endif()
if(NOT DEFINED CEF_ROOT OR NOT EXISTS "${CEF_ROOT}/cmake/FindCEF.cmake")
  message(FATAL_ERROR "Pass -DCEF_ROOT=/absolute/path/to/unpacked/CEF/linux64_minimal")
endif()
list(APPEND CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)
ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)
add_executable(miniator_cef_bridge miniator_cef_bridge.cc)
set_target_properties(miniator_cef_bridge PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON)
SET_EXECUTABLE_TARGET_PROPERTIES(miniator_cef_bridge)
target_include_directories(miniator_cef_bridge PRIVATE "${CEF_ROOT}")
target_link_libraries(miniator_cef_bridge libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS})
# CEF needs its matching Release/Resources files next to the running executable.
# Use the parent distribution's `Release` directory as output location.
set_target_properties(miniator_cef_bridge PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CEF_ROOT}/Release")

# Linux CEF binaries need the SDK's ICU and resource packs alongside the
# executable. Keep the large SDK files in place and create relative symlinks.
foreach(_resource icudtl.dat resources.pak chrome_100_percent.pak chrome_200_percent.pak locales)
  if(EXISTS "${CEF_ROOT}/Resources/${_resource}" AND NOT EXISTS "${CEF_ROOT}/Release/${_resource}")
    execute_process(
      COMMAND "${CMAKE_COMMAND}" -E create_symlink "../Resources/${_resource}" "${CEF_ROOT}/Release/${_resource}"
      RESULT_VARIABLE _link_code)
    if(NOT _link_code EQUAL 0)
      message(FATAL_ERROR "Could not link CEF resource ${_resource}")
    endif()
  endif()
endforeach()
