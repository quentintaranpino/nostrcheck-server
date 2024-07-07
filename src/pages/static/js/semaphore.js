
class Semaphore {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
  
    async acquire() {
        return new Promise(resolve => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
  
    release() {
        if (this.queue.length > 0) {
            const nextResolve = this.queue.shift();
            nextResolve();
        } else {
            this.locked = false;
        }
    }
  
    async execute(task) {
        console.log('Semaphore queue length:', this.getQueueLength());
        await this.acquire();
        try {
            console.log('Semaphore executing task', task.toString());
            await task();
        } finally {
            this.release();
        }
    }

    clearQueue() {
        this.queue = [];
        this.locked = false;
    }
    
    getQueueLength() {
        return this.queue.length;
    }

  }
  
  const semaphore = new Semaphore();

  async function storeAuthkey(authkey) {
    await localStorage.setItem('authkey', authkey);
    console.log('Updated localStorage authkey', authkey);
}