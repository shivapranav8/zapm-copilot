export interface Job {
    id: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    progress: number; // 0-100
    message: string;
    result?: any;
    error?: string;
}

const jobs = new Map<string, Job>();

export function createJob(id: string): Job {
    const job: Job = { id, status: 'pending', progress: 0, message: 'Starting...' };
    jobs.set(id, job);
    return job;
}

export function updateJob(id: string, updates: Partial<Omit<Job, 'id'>>) {
    const job = jobs.get(id);
    if (job) jobs.set(id, { ...job, ...updates });
}

export function getJob(id: string): Job | undefined {
    return jobs.get(id);
}

// Clean up jobs older than 1 hour to avoid memory leaks
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs.entries()) {
        if (job.status === 'done' || job.status === 'error') {
            jobs.delete(id);
        }
    }
}, 10 * 60 * 1000).unref();
