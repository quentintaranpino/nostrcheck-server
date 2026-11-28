// Preloaded with node -r: sizes the libuv pool before anything uses it. sharp
// (uploads, thumbnails) and fs share it, and 4 threads let a few image jobs stall
// every file read. Setting it from the app is too late: the ESM loader already
// started the pool while reading the modules.
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = "16";
