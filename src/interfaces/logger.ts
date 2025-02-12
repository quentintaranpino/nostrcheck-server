interface LogEvent {
    id : number;
    date: Date;
    severity: string;
    message: string;
}

export {LogEvent}