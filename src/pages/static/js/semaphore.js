
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
        console.log('Queue length:', this.getQueueLength());
        await this.acquire();
        try {
            await task(); // Ejecutar la tarea con la cookie más reciente
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