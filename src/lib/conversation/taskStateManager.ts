export type TaskState = 
  | 'IDLE' 
  | 'UNDERSTANDING' 
  | 'WAITING_FOR_INPUT' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCELLED';

export interface TaskStep {
  id: string;
  name: string;
  state: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export interface ActiveTask {
  id: string;
  name: string;
  description?: string;
  state: TaskState;
  turnId: number;
  steps: TaskStep[];
  retryCount: number;
  maxRetries: number;
  resultSummary?: string;
  error?: string;
  startTime: number;
  completedTime?: number;
}

export class TaskStateManager {
  private currentTask: ActiveTask | null = null;
  private recentTasks: ActiveTask[] = [];
  private static readonly MAX_RECENT_TASKS = 5;

  /**
   * Determine if user is requesting task cancellation
   */
  public isCancellationIntent(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    const cancelKeywords = [
      'cancel', 'stop', 'থামো', 'বাদ দাও', 'দরকার নেই', 'থাক', 'আর লাগবে না',
      'করতে হবে না', 'বন্ধ করো', 'থামো এখন'
    ];
    return cancelKeywords.some(kw => lower === kw || lower.startsWith(kw) || lower.includes(kw));
  }

  /**
   * Determine if user indicates confusion
   */
  public isConfusionIntent(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    const confusionKeywords = [
      'বুঝি নাই', 'বুঝতে পারছি না', 'মানে?', 'মানে', 'কীভাবে?', 'কিভাবে?',
      'সহজ করে বলো', 'সহজ করে বুঝাও', 'ভালো করে বুঝাও', 'don\'t understand',
      'didn\'t understand', 'what do you mean', 'explain simply'
    ];
    return confusionKeywords.some(kw => lower.includes(kw));
  }

  /**
   * Detect session-scoped response length preference
   */
  public detectLengthPreference(text: string): 'concise' | 'detailed' | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    if (
      lower.includes('ছোট করে') || 
      lower.includes('সংক্ষেপে') || 
      lower.includes('shortly') || 
      lower.includes('brief') ||
      lower.includes('in short')
    ) {
      return 'concise';
    }
    if (
      lower.includes('বিস্তারিত') || 
      lower.includes('ডিটেইল') || 
      lower.includes('in detail') || 
      lower.includes('elaborate') ||
      lower.includes('explain more')
    ) {
      return 'detailed';
    }
    return null;
  }

  /**
   * Start or deduplicate an active task
   */
  public startTask(name: string, turnId: number, options?: {
    description?: string;
    steps?: string[];
  }): { task: ActiveTask; isDuplicate: boolean } {
    // Check if an identical task is already running in PROCESSING state
    if (this.currentTask && this.currentTask.name === name && this.currentTask.state === 'PROCESSING') {
      console.log(`[TaskStateManager] Reusing currently processing task: ${name}`);
      return { task: this.currentTask, isDuplicate: true };
    }

    // Archive previous task if present
    if (this.currentTask) {
      this.archiveTask(this.currentTask);
    }

    const newTask: ActiveTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      description: options?.description,
      state: 'UNDERSTANDING',
      turnId,
      steps: (options?.steps || []).map((stepName, idx) => ({
        id: `step_${idx + 1}`,
        name: stepName,
        state: 'PENDING',
      })),
      retryCount: 0,
      maxRetries: 1, // Strict single retry policy
      startTime: Date.now(),
    };

    this.currentTask = newTask;
    return { task: newTask, isDuplicate: false };
  }

  /**
   * Set task state to PROCESSING
   */
  public setProcessing(progressMessage?: string): ActiveTask | null {
    if (!this.currentTask) return null;
    this.currentTask.state = 'PROCESSING';
    if (this.currentTask.steps.length > 0 && this.currentTask.steps[0].state === 'PENDING') {
      this.currentTask.steps[0].state = 'RUNNING';
    }
    return this.currentTask;
  }

  /**
   * Complete active task
   */
  public completeTask(resultSummary?: string): ActiveTask | null {
    if (!this.currentTask) return null;
    this.currentTask.state = 'COMPLETED';
    this.currentTask.resultSummary = resultSummary;
    this.currentTask.completedTime = Date.now();
    this.currentTask.steps.forEach(s => {
      if (s.state === 'RUNNING' || s.state === 'PENDING') {
        s.state = 'COMPLETED';
      }
    });

    const completed = this.currentTask;
    this.archiveTask(completed);
    this.currentTask = null;
    return completed;
  }

  /**
   * Fail active task
   */
  public failTask(error: string): ActiveTask | null {
    if (!this.currentTask) return null;
    this.currentTask.state = 'FAILED';
    this.currentTask.error = error;
    this.currentTask.completedTime = Date.now();

    const failed = this.currentTask;
    this.archiveTask(failed);
    this.currentTask = null;
    return failed;
  }

  /**
   * Cancel active task
   */
  public cancelTask(reason: string = 'User requested cancellation'): ActiveTask | null {
    if (!this.currentTask) return null;
    this.currentTask.state = 'CANCELLED';
    this.currentTask.error = reason;
    this.currentTask.completedTime = Date.now();

    const cancelled = this.currentTask;
    this.archiveTask(cancelled);
    this.currentTask = null;
    return cancelled;
  }

  /**
   * Attempt a safe single retry for a failed task
   */
  public retryActiveTask(): boolean {
    if (!this.currentTask) return false;
    if (this.currentTask.retryCount >= this.currentTask.maxRetries) {
      return false;
    }
    this.currentTask.retryCount += 1;
    this.currentTask.state = 'PROCESSING';
    this.currentTask.error = undefined;
    return true;
  }

  public getActiveTask(): ActiveTask | null {
    return this.currentTask;
  }

  public getRecentTasks(): ActiveTask[] {
    return [...this.recentTasks];
  }

  public clear(): void {
    this.currentTask = null;
    this.recentTasks = [];
  }

  private archiveTask(task: ActiveTask): void {
    this.recentTasks.push({ ...task });
    if (this.recentTasks.length > TaskStateManager.MAX_RECENT_TASKS) {
      this.recentTasks.shift();
    }
  }
}

export const taskStateManager = new TaskStateManager();
