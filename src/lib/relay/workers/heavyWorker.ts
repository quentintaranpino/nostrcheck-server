import workerpool from "workerpool";

/**
 * Process heavy, resource-intensive tasks
 * @param {*} task - The task to process
 * @returns {*} - The result of executing the task
 */
interface Task {
    fn: (...args: any[]) => any;
    args?: any[];
}

function heavyWorker(task: Task): any {
    try {
        if (!task || !task.fn) {
            return { error: true, message: "Invalid task structure" };
        }
        return task.fn(...(task.args || []));
    } catch (error) {
        return error;
    }
}


// Registrar la función en el workerpool
workerpool.worker({
  heavyWorker: heavyWorker
});