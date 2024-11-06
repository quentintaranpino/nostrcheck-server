
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
            // Actualizar la cookie o verificar que está actualizada antes de ejecutar la tarea
            await this.updateCookie(); // Método para actualizar la cookie

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

    async updateCookie() {
        try {
            await fetch('/api/v2/', {
                method: 'GET',
                credentials: 'include', 
                headers: {
                    "Content-Type": "application/json"
                }
            });
        } catch (error) {
            console.error("Error updating cookie:", error);
        }
    }
  }
  
  const semaphore = new Semaphore();