import fs from 'fs';
import path from 'path';

// Define the data path
const DATA_FILE = path.join(process.cwd(), 'server', 'data', 'genqa.json');

// Define types reflecting the Go PostgreSQL schema
export interface Prompt {
    teamname: string;
    task: string;
    live_version: number;
    created_at: string;
    updated_at: string;
}

export interface PromptVersion {
    serial_no: number;
    teamname: string;
    task: string;
    prompt_version: number;
    prompt: string;
    system_prompt: string;
    user_prompt: string;
    live: boolean;
    created_at: string;
    updated_at: string;
}

export interface TestSet {
    serial_no: number;
    teamname: string;
    task: string;
    prompt_version: number;
    testset: string[];
    created_at: string;
    updated_at: string;
}

interface GenQADatabase {
    prompts: Prompt[];
    promptVersions: PromptVersion[];
    testsets: TestSet[];
}

class GenQADb {
    private data: GenQADatabase = {
        prompts: [],
        promptVersions: [],
        testsets: [],
    };

    constructor() {
        this.load();
    }

    private load() {
        if (!fs.existsSync(DATA_FILE)) {
            this.save();
        } else {
            try {
                const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
                this.data = JSON.parse(fileData);
            } catch (err) {
                console.error('Failed to load genqa.json. Creating new empty DB.', err);
                this.save();
            }
        }
    }

    private save() {
        try {
            fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (err) {
            console.error('Failed to save to genqa.json', err);
        }
    }

    private getNow(): string {
        return new Date().toISOString();
    }

    // --- PROMPTS ---

    public getAllPrompts(): Prompt[] {
        return [...this.data.prompts];
    }

    public getPromptsByTeam(teamname: string): Prompt[] {
        return this.data.prompts.filter((p) => p.teamname === teamname);
    }

    public getPrompt(teamname: string, task: string): Prompt | undefined {
        return this.data.prompts.find((p) => p.teamname === teamname && p.task === task);
    }

    public upsertPrompt(teamname: string, task: string, live_version: number = 0): Prompt {
        const existing = this.getPrompt(teamname, task);
        if (existing) {
            existing.live_version = live_version;
            existing.updated_at = this.getNow();
            this.save();
            return existing;
        }

        const newPrompt: Prompt = {
            teamname,
            task,
            live_version,
            created_at: this.getNow(),
            updated_at: this.getNow(),
        };
        this.data.prompts.push(newPrompt);
        this.save();
        return newPrompt;
    }

    public deletePrompt(teamname: string, task: string): boolean {
        const initialLen = this.data.prompts.length;
        this.data.prompts = this.data.prompts.filter((p) => !(p.teamname === teamname && p.task === task));
        
        // Cascade delete versions and testsets
        this.data.promptVersions = this.data.promptVersions.filter(
            (v) => !(v.teamname === teamname && v.task === task)
        );
        this.data.testsets = this.data.testsets.filter(
            (ts) => !(ts.teamname === teamname && ts.task === task)
        );

        const deleted = this.data.prompts.length < initialLen;
        if (deleted) this.save();
        return deleted;
    }

    public updatePromptLiveVersion(teamname: string, task: string, live_version: number): boolean {
        const p = this.getPrompt(teamname, task);
        if (p) {
            p.live_version = live_version;
            p.updated_at = this.getNow();
            this.save();
            return true;
        }
        return false;
    }

    // --- PROMPT VERSIONS ---

    public getPromptVersionsByTask(teamname: string, task: string): PromptVersion[] {
        return this.data.promptVersions
            .filter((v) => v.teamname.toLowerCase() === teamname.toLowerCase() && v.task.toLowerCase() === task.toLowerCase())
            .sort((a, b) => b.prompt_version - a.prompt_version);
    }

    public getLivePromptVersion(teamname: string, task: string): PromptVersion | undefined {
        return this.data.promptVersions.find(
            (v) => v.teamname === teamname && v.task === task && v.live === true
        );
    }

    public getPromptVersion(serial_no: number): PromptVersion | undefined {
        return this.data.promptVersions.find((v) => v.serial_no === serial_no);
    }

    public generateSerialNo(type: 'version' | 'testset'): number {
        const arr = type === 'version' ? this.data.promptVersions : this.data.testsets;
        if (arr.length === 0) return 1;
        return Math.max(...arr.map((item) => item.serial_no)) + 1;
    }

    private splitPromptText(fullPrompt: string): { systemPrompt: string; userPrompt: string } {
        const delimiter = "---SYSTEM_USER_SEPARATOR---";
        const parts = fullPrompt.split(delimiter);
        if (parts.length >= 2) {
            return {
                systemPrompt: parts[0].trim(),
                userPrompt: parts.slice(1).join(delimiter).trim() // handle edge case with multiple delimiters
            };
        } else {
            return {
                systemPrompt: "",
                userPrompt: fullPrompt.trim()
            };
        }
    }

    public insertPromptVersion(versionParams: {
        teamname: string;
        task: string;
        prompt_version: number;
        prompt: string;
        live: boolean;
    }): PromptVersion {
        // Enforce live state exclusivity for this task
        if (versionParams.live) {
            this.data.promptVersions.forEach((v) => {
                if (v.teamname === versionParams.teamname && v.task === versionParams.task) {
                    v.live = false;
                }
            });
            // Update prompt's live version
            this.updatePromptLiveVersion(versionParams.teamname, versionParams.task, versionParams.prompt_version);
        }

        const { systemPrompt, userPrompt } = this.splitPromptText(versionParams.prompt);

        const newVersion: PromptVersion = {
            serial_no: this.generateSerialNo('version'),
            teamname: versionParams.teamname,
            task: versionParams.task,
            prompt_version: versionParams.prompt_version,
            prompt: versionParams.prompt,
            system_prompt: systemPrompt,
            user_prompt: userPrompt,
            live: versionParams.live,
            created_at: this.getNow(),
            updated_at: this.getNow(),
        };

        this.data.promptVersions.push(newVersion);
        this.save();
        return newVersion;
    }

    public setPromptVersionLive(serial_no: number): boolean {
        const version = this.getPromptVersion(serial_no);
        if (!version) return false;

        // Unset all live versions for this task
        this.data.promptVersions.forEach((v) => {
            if (v.teamname === version.teamname && v.task === version.task) {
                v.live = false;
                v.updated_at = this.getNow();
            }
        });

        // Set this version live
        version.live = true;
        version.updated_at = this.getNow();

        // Update main prompt live version
        this.updatePromptLiveVersion(version.teamname, version.task, version.prompt_version);

        this.save();
        return true;
    }

    public updatePromptVersionText(serial_no: number, promptText: string): boolean {
        const version = this.getPromptVersion(serial_no);
        if (!version) return false;

        const { systemPrompt, userPrompt } = this.splitPromptText(promptText);
        version.prompt = promptText;
        version.system_prompt = systemPrompt;
        version.user_prompt = userPrompt;
        version.updated_at = this.getNow();
        this.save();
        return true;
    }

    public deletePromptVersion(serial_no: number): boolean {
        const initialLen = this.data.promptVersions.length;
        this.data.promptVersions = this.data.promptVersions.filter((v) => v.serial_no !== serial_no);
        const deleted = this.data.promptVersions.length < initialLen;
        if (deleted) this.save();
        return deleted;
    }

    // --- TESTSETS ---

    public getTestSetsByTask(teamname: string, task: string, prompt_version: number): TestSet[] {
        return this.data.testsets.filter(
            (ts) => ts.teamname === teamname && ts.task === task && ts.prompt_version === prompt_version
        );
    }

    public insertTestSet(teamname: string, task: string, prompt_version: number, testset: string[]): TestSet {
        const newTs: TestSet = {
            serial_no: this.generateSerialNo('testset'),
            teamname,
            task,
            prompt_version,
            testset,
            created_at: this.getNow(),
            updated_at: this.getNow(),
        };
        this.data.testsets.push(newTs);
        this.save();
        return newTs;
    }

    public updateTestSet(teamname: string, task: string, prompt_version: number, testset: string[]): boolean {
        const ts = this.data.testsets.find(
            (t) => t.teamname === teamname && t.task === task && t.prompt_version === prompt_version
        );
        if (ts) {
            ts.testset = testset;
            ts.updated_at = this.getNow();
            this.save();
            return true;
        }
        return false;
    }

    public deleteTestSet(serial_no: number): boolean {
        const initialLen = this.data.testsets.length;
        this.data.testsets = this.data.testsets.filter((t) => t.serial_no !== serial_no);
        const deleted = this.data.testsets.length < initialLen;
        if (deleted) this.save();
        return deleted;
    }
}

// Export singleton instance
export const genqaDb = new GenQADb();
