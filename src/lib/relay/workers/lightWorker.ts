import workerpool from "workerpool";

/**
 * Process light tasks efficiently
 * @param {*} task - The task to process
 * @returns {*} - The result of executing the task
 */
interface Task {
    fn: (...args: any[]) => any;
    args?: any[];
}

function lightWorker(task: Task): any {
    try {
        if (!task || !task.fn) {
            return { error: true, message: "Invalid task structure" };
        }
        return task.fn(...(task.args || []));
    } catch (error) {
        return error;
    }
}

workerpool.worker({
  lightWorker: lightWorker
});