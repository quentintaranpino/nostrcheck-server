class Semaphore {
    constructor(maxConcurrent = 3) {
      this.queue = [];
      this.currentCount = 0;
      this.maxConcurrent = maxConcurrent;
    }
  
    async acquire() {
      return new Promise(resolve => {
        const tryAcquire = () => {
          if (this.currentCount < this.maxConcurrent) {
            this.currentCount++;
            resolve();
          } else {
            this.queue.push(tryAcquire);
          }
        };
        tryAcquire();
      });
    }
  
    release() {
      this.currentCount--;
      if (this.queue.length > 0) {
        const nextAcquire = this.queue.shift();
        nextAcquire();
      }
    }
  
    async execute(task) {
      console.log(`Queue length: ${this.getQueueLength()}`);
      await this.acquire();
      try {
        await task(); 
      } finally {
        this.release();
      }
    }
  
    clearQueue() {
      this.queue = [];
      this.currentCount = 0;
    }
  
    getQueueLength() {
      return this.queue.length;
    }
  }
  
  const semaphore = new Semaphore(10);
  