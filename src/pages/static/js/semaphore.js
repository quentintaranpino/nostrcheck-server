
class Semaphore {
    constructor() {
        this.queue = [];
        this.locked = false;
        console.log('Semaphore initialized');
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
        await this.acquire();
        console.log("Semaphore queue length: " + this.queue.length)
        try {
            await task();
        } finally {
            this.release();
        }
    }

    clearQueue() {
        console.log('Clearing semaphore queue');
        this.queue = [];
        this.locked = false;
    }

  }
  
  const semaphore = new Semaphore();

  function storeAuthkey(authkey) {
    if (authkey) {
        console.log("old authkey", localStorage.getItem('authkey'))
        console.log("new authkey", authkey)
        localStorage.setItem('authkey', authkey);
        console.debug('Authkey updated in localStorage:', authkey);
    } else {
        console.warn('Received empty authkey, not updating localStorage');
    }
}