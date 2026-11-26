// sharp (uploads, thumbnails) and fs share the libuv pool; 4 threads let a few image
// jobs stall every file read. libuv sizes the pool on first use, and the other imports
// of init.ts already use it, so this has to be the first import there.
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = "16";

export {};
