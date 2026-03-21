import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Search, RefreshCw, Play, Save, Upload, Trash2, Check, X, FlaskRound, FileText, Copy, Loader2, Settings, ChevronDown, Sparkles, Star, FileUp, BarChart2 } from 'lucide-react';
import { apiFetch } from '../../utils/apiFetch';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface Prompt {
    teamname: string;
    task: string;
    live_version: number;
    created_at: string;
    updated_at: string;
}

interface TestSet {
    serial_no?: number;
    teamname: string;
    task: string;
    prompt_version: number;
    testset: string[];
    created_at?: string;
    updated_at?: string;
}

interface ScoringCriterion {
    name: string;
    description: string;
    maxScore: number;
}

interface TestCaseResult {
    response: string;
    scores: Record<string, { score: number; justification: string }>;
    totalScore: number;
    maxTotalScore: number;
    running: boolean;
    error?: string;
}

// AI model definitions
const AI_MODELS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
    openai: {
        label: 'OpenAI',
        models: [
            { value: 'gpt-4o', label: 'GPT-4O' },
            { value: 'gpt-4o-mini', label: 'GPT-4O Mini' },
        ],
    },
    anthropic: {
        label: 'Anthropic',
        models: [
            { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
            { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
        ],
    },
    google_vertex: {
        label: 'Vertex AI',
        models: [
            { value: 'gemini-pro', label: 'Gemini Pro' },
        ],
    },
    zia: {
        label: 'ZIA',
        models: [
            { value: 'zia-default', label: 'ZIA Default' },
        ],
    },
};

// ─── Main Component ───────────────────────────────────────────────────
interface GenQAPageProps {
    onBack: () => void;
}

export function GenQAPage({ onBack }: GenQAPageProps) {
    // View state
    const [view, setView] = useState<'studio' | 'editor'>('studio');

    // Data state
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [filteredPrompts, setFilteredPrompts] = useState<Prompt[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);

    // Editor state
    const [promptName, setPromptName] = useState('');
    const [promptMode, setPromptMode] = useState<'single' | 'system_user'>('single');
    const [singlePrompt, setSinglePrompt] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [userPrompt, setUserPrompt] = useState('');
    const [livePromptText, setLivePromptText] = useState('');
    const [promptCollapsed, setPromptCollapsed] = useState(false);

    // Model settings
    const [testVendor, setTestVendor] = useState('');
    const [testModel, setTestModel] = useState('');
    const [temperature, setTemperature] = useState(0.7);
    const [maxTokens, setMaxTokens] = useState(1000);
    const [topP, setTopP] = useState(1);
    const [topK, setTopK] = useState(1);
    const [testContext, setTestContext] = useState('');
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Test cases
    const [evalInputs, setEvalInputs] = useState<string[]>(['']);
    const [testCaseResults, setTestCaseResults] = useState<Record<number, TestCaseResult>>({});
    const [runningAll, setRunningAll] = useState(false);

    // Scoring rubric
    const [evalCriteria, setEvalCriteria] = useState<ScoringCriterion[]>([
        { name: 'Accuracy', description: 'Does the response correctly address the question?', maxScore: 10 },
        { name: 'Helpfulness', description: 'Is the response actionable and useful?', maxScore: 10 },
        { name: 'Tone', description: 'Is the tone appropriate and professional?', maxScore: 5 },
    ]);
    const [showScoringPanel, setShowScoringPanel] = useState(false);
    const [harshness, setHarshness] = useState(5);

    // System prompt generation
    const [genSystemPromptLoading, setGenSystemPromptLoading] = useState(false);

    // AI question generation
    const [genQuestionsContext, setGenQuestionsContext] = useState('');
    const [genQuestionsCount, setGenQuestionsCount] = useState(5);
    const [genQuestionsRunning, setGenQuestionsRunning] = useState(false);
    const [showGeneratePanel, setShowGeneratePanel] = useState(false);

    // Testset save/load (for persisting collections)
    const [testsets, setTestsets] = useState<TestSet[]>([]);

    // ─── API calls ────────────────────────────────────────────────────
    const fetchPrompts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/genqa/prompts');
            const data = await res.json();
            const list = data.success && Array.isArray(data.data) ? data.data : [];
            setPrompts(list);
            setFilteredPrompts(list);
        } catch (err: any) {
            toast.error('Failed to load prompts: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchLivePrompt = useCallback(async (name: string) => {
        try {
            const res = await apiFetch(`/api/genqa/prompt-versions/default/${encodeURIComponent(name)}/live`);
            const data = await res.json();
            if (data.success && data.data) {
                setLivePromptText(data.data.prompt || 'No live prompt text');
                if (data.data.system_prompt || data.data.user_prompt) {
                    setPromptMode('system_user');
                    setSystemPrompt(data.data.system_prompt || '');
                    setUserPrompt(data.data.user_prompt || '');
                } else {
                    setPromptMode('single');
                    setSinglePrompt(data.data.prompt || '');
                }
            } else {
                setLivePromptText('');
            }
        } catch {
            setLivePromptText('');
        }
    }, []);

    const fetchTestsets = useCallback(async (name: string) => {
        try {
            const res = await apiFetch(`/api/genqa/testsets?teamname=default&task=${encodeURIComponent(name)}&prompt_version=1`);
            const data = await res.json();
            const list = data.success ? (Array.isArray(data.data) ? data.data : [data.data]) : [];
            setTestsets(list.filter(Boolean));
        } catch {
            setTestsets([]);
        }
    }, []);

    // ─── Effects ──────────────────────────────────────────────────────
    useEffect(() => {
        if (view === 'studio') fetchPrompts();
    }, [view, fetchPrompts]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setFilteredPrompts(prompts);
        } else {
            const term = searchTerm.toLowerCase();
            setFilteredPrompts(prompts.filter(p =>
                p.teamname.toLowerCase().includes(term) ||
                p.task.toLowerCase().includes(term)
            ));
        }
    }, [searchTerm, prompts]);

    // ─── Handlers ─────────────────────────────────────────────────────
    const openEditor = (prompt?: Prompt) => {
        if (prompt) {
            const name = prompt.task;
            setPromptName(name);
            fetchLivePrompt(name);
            fetchTestsets(name);
        } else {
            setPromptName('');
            setSinglePrompt('');
            setSystemPrompt('');
            setUserPrompt('');
            setLivePromptText('');
            setTestsets([]);
        }
        setEvalInputs(['']);
        setTestCaseResults({});
        setView('editor');
    };

    const handleSave = async (live: boolean) => {
        if (!promptName) {
            toast.error('Enter a Prompt Name first');
            return;
        }
        const body: any = { teamname: 'default', task: promptName, live };
        if (promptMode === 'system_user') {
            body.system_prompt = systemPrompt;
            body.user_prompt = userPrompt;
            body.prompt = `${systemPrompt}---SYSTEM_USER_SEPARATOR---${userPrompt}`;
        } else {
            body.prompt = singlePrompt;
        }
        try {
            const res = await apiFetch('/api/genqa/prompt-versions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(live ? 'Published as live!' : 'Saved as draft!');
                fetchLivePrompt(promptName);
            } else {
                toast.error(data.error || 'Failed to save');
            }
        } catch (err: any) {
            toast.error('Save failed: ' + err.message);
        }
    };

    const handleRunSingle = async (idx: number) => {
        const input = evalInputs[idx]?.trim();
        if (!input) { toast.error('Enter a test input first'); return; }
        if (!testVendor || !testModel) { setShowSettingsModal(true); toast.error('Select a model in Settings'); return; }

        const maxTotalScore = evalCriteria.reduce((s, c) => s + c.maxScore, 0);
        setTestCaseResults(prev => ({
            ...prev,
            [idx]: { response: '', scores: {}, totalScore: 0, maxTotalScore, running: true },
        }));

        try {
            // Step 1: get AI response
            const testBody: any = {
                vendor: testVendor, model: testModel,
                temperature: String(temperature), max_token: String(maxTokens),
                top_p: String(topP), top_k: String(topK),
            };
            if (promptMode === 'system_user') {
                testBody.system_prompt = systemPrompt;
                testBody.user_prompt = input;
            } else {
                testBody.query = input;
                testBody.context = testContext || 'You are a helpful assistant.';
            }

            const testRes = await apiFetch('/api/genqa/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testBody),
            });
            const testData = await testRes.json();
            const responseText = testData.success ? testData.data?.response : '';

            if (!responseText) {
                setTestCaseResults(prev => ({
                    ...prev,
                    [idx]: { response: '', scores: {}, totalScore: 0, maxTotalScore, running: false, error: testData.error || 'No response' },
                }));
                return;
            }

            // Step 2: score if criteria set
            if (evalCriteria.length > 0 && showScoringPanel) {
                const scoreRes = await apiFetch('/api/genqa/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: input, response: responseText, criteria: evalCriteria, harshness }),
                });
                const scoreData = await scoreRes.json();
                const scores = scoreData.success ? (scoreData.data?.scores || {}) : {};
                const totalScore = Object.values(scores).reduce((s: number, v: any) => s + (v?.score || 0), 0);
                setTestCaseResults(prev => ({
                    ...prev,
                    [idx]: { response: responseText, scores, totalScore, maxTotalScore, running: false },
                }));
            } else {
                setTestCaseResults(prev => ({
                    ...prev,
                    [idx]: { response: responseText, scores: {}, totalScore: 0, maxTotalScore: 0, running: false },
                }));
            }
        } catch (err: any) {
            setTestCaseResults(prev => ({
                ...prev,
                [idx]: { response: '', scores: {}, totalScore: 0, maxTotalScore, running: false, error: err.message },
            }));
        }
    };

    const handleRunAllTests = async () => {
        const validIndices = evalInputs.map((inp, idx) => ({ inp: inp.trim(), idx })).filter(({ inp }) => inp);
        if (validIndices.length === 0) { toast.error('Add at least one test input'); return; }
        if (!testVendor || !testModel) { setShowSettingsModal(true); toast.error('Select a model in Settings'); return; }
        setRunningAll(true);
        for (const { idx } of validIndices) {
            await handleRunSingle(idx);
        }
        setRunningAll(false);
        toast.success(`Done — ${validIndices.length} cases evaluated`);
    };

    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const inputs = lines.map(l => {
                const match = l.match(/^"(.+?)"/);
                return (match ? match[1] : l.split(',')[0]).trim();
            }).filter(Boolean);
            if (inputs.length === 0) { toast.error('No valid inputs found in CSV'); return; }
            setEvalInputs(inputs);
            setTestCaseResults({});
            toast.success(`Loaded ${inputs.length} inputs from CSV`);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleGenerateQuestions = async () => {
        if (!genQuestionsContext.trim()) { toast.error('Enter context for question generation'); return; }
        setGenQuestionsRunning(true);
        try {
            const res = await apiFetch('/api/genqa/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: genQuestionsContext, count: genQuestionsCount }),
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.data?.questions)) {
                setEvalInputs(data.data.questions);
                setTestCaseResults({});
                toast.success(`Generated ${data.data.questions.length} questions!`);
            } else {
                toast.error(data.error || 'Failed to generate questions');
            }
        } catch (err: any) {
            toast.error('Generation failed: ' + err.message);
        } finally {
            setGenQuestionsRunning(false);
        }
    };

    const handleGenerateSystemPrompt = async () => {
        if (!promptName) { toast.error('Enter a Prompt Name first so AI knows what to generate'); return; }
        if (!testVendor || !testModel) { setShowSettingsModal(true); toast.error('Select a vendor and model first — the prompt will be written in that model\'s style'); return; }
        setGenSystemPromptLoading(true);
        try {
            const res = await apiFetch('/api/genqa/generate-system-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamname: 'default',
                    task: promptName,
                    userPrompt: promptMode === 'system_user' ? userPrompt : undefined,
                    sampleInputs: evalInputs.filter(i => i.trim()),
                    vendor: testVendor,
                    model: testModel,
                }),
            });
            const data = await res.json();
            if (data.success && data.data?.systemPrompt) {
                if (promptMode === 'system_user') {
                    setSystemPrompt(data.data.systemPrompt);
                } else {
                    setSinglePrompt(data.data.systemPrompt);
                    setPromptMode('system_user');
                    setSystemPrompt(data.data.systemPrompt);
                    setSinglePrompt('');
                }
                toast.success(`System prompt generated using ${testModel}!`);
            } else {
                toast.error(data.error || 'Failed to generate');
            }
        } catch (err: any) {
            toast.error('Generation failed: ' + err.message);
        } finally {
            setGenSystemPromptLoading(false);
        }
    };

    const handleDeletePrompt = async (name: string) => {
        if (!confirm(`Delete prompt "${name}" and all its versions?`)) return;
        try {
            const res = await apiFetch(`/api/genqa/prompts/default/${encodeURIComponent(name)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                toast.success('Deleted!');
                fetchPrompts();
            } else {
                toast.error(data.error || 'Failed');
            }
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const handleSaveTestCollection = async () => {
        const items = evalInputs.filter(s => s.trim());
        if (items.length === 0) { toast.error('No inputs to save'); return; }
        if (!promptName) { toast.error('Enter a Prompt Name first'); return; }
        try {
            const res = await apiFetch('/api/genqa/testsets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamname: 'default', task: promptName, prompt_version: 1, testset: items }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Test collection saved!');
                fetchTestsets(promptName);
            } else {
                toast.error(data.error || 'Failed');
            }
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    // Extract placeholders {{placeholder}}
    const extractPlaceholders = (text: string): string[] => {
        const matches = text.match(/\{\{(\w+)\}\}/g) || [];
        return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
    };

    const currentPromptText = promptMode === 'system_user' ? `${systemPrompt}\n${userPrompt}` : singlePrompt;
    const placeholders = extractPlaceholders(currentPromptText);
    const completedCount = Object.values(testCaseResults).filter(r => !r.running && r.response).length;
    const maxTotalScore = evalCriteria.reduce((s, c) => s + c.maxScore, 0);
    const validCaseCount = evalInputs.filter(i => i.trim()).length;

    // ─── Studio View ──────────────────────────────────────────────────
    if (view === 'studio') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <FlaskRound className="w-6 h-6 text-teal-600" />
                                    AI Evals Studio
                                </h1>
                                <p className="text-sm text-gray-500">Manage, version, and test AI prompts</p>
                            </div>
                        </div>
                        <button
                            onClick={() => openEditor()}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-md"
                        >
                            <Plus className="w-4 h-4" />
                            New Prompt
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-7xl mx-auto p-6">
                    <div className="mb-6">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search prompts..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-800">Available Prompts</h2>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                    {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''}
                                </span>
                                <button onClick={fetchPrompts} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                    <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center text-gray-500">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-teal-600" />
                                <p>Loading prompts...</p>
                            </div>
                        ) : filteredPrompts.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-lg font-medium">No prompts found</p>
                                <p className="text-sm mt-1">Create a new prompt to get started</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Prompt Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Updated</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPrompts.map((p, i) => (
                                        <tr
                                            key={`${p.teamname}-${p.task}-${i}`}
                                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                                            onClick={() => openEditor(p)}
                                        >
                                            <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                                                {p.teamname !== 'default' ? `${p.teamname} / ${p.task}` : p.task}
                                            </td>
                                            <td className="px-6 py-4">
                                                {p.live_version > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        <Check className="w-3 h-3" /> Live (v{p.live_version})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                        Draft
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDeletePrompt(p.task); }}
                                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ─── Editor View ──────────────────────────────────────────────────
    return (
        <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col overflow-hidden">

            {/* ── Header ── */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm z-10 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('studio')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-base font-bold text-gray-900">
                                {promptName || 'New Prompt'}
                            </h1>
                            <p className="text-xs text-gray-400">Prompt Editor & Evals</p>
                        </div>
                        {completedCount > 0 && (
                            <span className="ml-2 text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full font-medium">
                                {completedCount}/{evalInputs.filter(i => i.trim()).length} ran
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSettingsModal(s => !s)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                            <Settings className="w-3.5 h-3.5" /> Settings
                        </button>
                        <button
                            onClick={() => handleSave(false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                        >
                            <Save className="w-3.5 h-3.5" /> Save Draft
                        </button>
                        <button
                            onClick={() => handleSave(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors shadow-sm"
                        >
                            <Upload className="w-3.5 h-3.5" /> Publish Live
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Body: scrollable ── */}
            <div className="flex-1 overflow-y-auto">

                {/* ── Prompt Editor (collapsible) ── */}
                <div className="bg-white border-b border-gray-200 shadow-sm">
                    {/* Collapse header */}
                    <div
                        className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                        onClick={() => setPromptCollapsed(c => !c)}
                    >
                        <div className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-teal-600" />
                            <span className="text-sm font-semibold text-gray-800">Prompt</span>
                            {livePromptText && (
                                <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-medium">Live</span>
                            )}
                            {/* Prompt name — always accessible */}
                            <div className="ml-2" onClick={e => e.stopPropagation()}>
                                <input
                                    value={promptName}
                                    onChange={e => setPromptName(e.target.value)}
                                    placeholder="Prompt Name"
                                    className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-medium w-44 focus:ring-1 focus:ring-teal-500 focus:bg-white transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                            {/* Prompt mode toggle */}
                            <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                                <button
                                    onClick={() => setPromptMode('single')}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${promptMode === 'single' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Single
                                </button>
                                <button
                                    onClick={() => setPromptMode('system_user')}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${promptMode === 'system_user' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    System + User
                                </button>
                            </div>
                            <ChevronDown
                                onClick={() => setPromptCollapsed(c => !c)}
                                className={`w-4 h-4 text-gray-400 transition-transform duration-200 cursor-pointer ${promptCollapsed ? '' : 'rotate-180'}`}
                            />
                        </div>
                    </div>

                    {!promptCollapsed && (
                        <div className="px-6 pb-5 pt-1">
                            {/* Model row */}
                            <div className="flex items-center gap-3 mb-4">
                                <select
                                    value={testVendor}
                                    onChange={e => { setTestVendor(e.target.value); setTestModel(''); }}
                                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                                >
                                    <option value="">Select Vendor</option>
                                    {Object.entries(AI_MODELS).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={testModel}
                                    onChange={e => setTestModel(e.target.value)}
                                    disabled={!testVendor}
                                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all disabled:opacity-50"
                                >
                                    <option value="">Choose Model</option>
                                    {testVendor && AI_MODELS[testVendor]?.models.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                                {!testVendor && (
                                    <span className="text-xs text-amber-600 font-medium">← Select a model to run evals</span>
                                )}
                            </div>

                            {/* Prompt editor */}
                            {promptMode === 'single' ? (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prompt</label>
                                        <button
                                            onClick={handleGenerateSystemPrompt}
                                            disabled={genSystemPromptLoading}
                                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            title={testVendor ? `Generate using ${testModel} (${testVendor})` : 'Select a model first'}
                                        >
                                            {genSystemPromptLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                            {genSystemPromptLoading ? 'Generating...' : `Generate${testModel ? ` with ${testModel}` : ''}`}
                                        </button>
                                    </div>
                                    <textarea
                                        value={singlePrompt}
                                        onChange={e => setSinglePrompt(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 font-mono text-sm leading-relaxed resize-y transition-all"
                                        rows={8}
                                        placeholder="Enter your prompt here. Use {{placeholder}} for variables..."
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">System Instructions</label>
                                            <button
                                                onClick={handleGenerateSystemPrompt}
                                                disabled={genSystemPromptLoading}
                                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title={testVendor ? `Generate using ${testModel} (${testVendor})` : 'Select a model first'}
                                            >
                                                {genSystemPromptLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                                {genSystemPromptLoading ? 'Generating...' : `Generate${testModel ? ` with ${testModel}` : ''}`}
                                            </button>
                                        </div>
                                        <textarea
                                            value={systemPrompt}
                                            onChange={e => setSystemPrompt(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 font-mono text-sm leading-relaxed resize-y transition-all"
                                            rows={8}
                                            placeholder="You are a helpful assistant..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">User Input Template</label>
                                        <textarea
                                            value={userPrompt}
                                            onChange={e => setUserPrompt(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 font-mono text-sm leading-relaxed resize-y transition-all"
                                            rows={8}
                                            placeholder="User message. Use {{placeholder}} for variables..."
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Detected variables */}
                            {placeholders.length > 0 && (
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400 font-medium">Variables:</span>
                                    {placeholders.map(p => (
                                        <span key={p} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold rounded border border-amber-200">
                                            {`{{${p}}}`}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Test Cases Panel ── */}
                <div className="p-5 space-y-4">

                    {/* Toolbar */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => { setEvalInputs([...evalInputs, '']); }}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5" /> Add Case
                        </button>
                        <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors shadow-sm cursor-pointer">
                            <FileUp className="w-3.5 h-3.5" /> Upload CSV
                            <input type="file" accept=".csv,.txt" onChange={handleCSVUpload} className="sr-only" />
                        </label>
                        <button
                            onClick={() => setShowGeneratePanel(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors shadow-sm border ${showGeneratePanel ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Generate
                        </button>
                        <button
                            onClick={() => setShowScoringPanel(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors shadow-sm border ${showScoringPanel ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        >
                            <Star className="w-3.5 h-3.5" />
                            {showScoringPanel ? `Scoring (${evalCriteria.length} criteria)` : 'Add Scoring'}
                        </button>
                        {evalInputs.filter(i => i.trim()).length > 0 && (
                            <button
                                onClick={handleSaveTestCollection}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors shadow-sm"
                            >
                                <Copy className="w-3.5 h-3.5" /> Save Set
                            </button>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                                {validCaseCount} case{validCaseCount !== 1 ? 's' : ''}
                            </span>
                            {Object.keys(testCaseResults).length > 0 && (
                                <button
                                    onClick={() => setTestCaseResults({})}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
                                >
                                    Clear Results
                                </button>
                            )}
                            <button
                                onClick={handleRunAllTests}
                                disabled={runningAll}
                                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-md"
                            >
                                {runningAll ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running...</> : <><Play className="w-3.5 h-3.5" /> Run All</>}
                            </button>
                        </div>
                    </div>

                    {/* Generate Panel */}
                    {showGeneratePanel && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <h3 className="text-xs font-semibold text-purple-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Generate Questions with AI
                            </h3>
                            <textarea
                                value={genQuestionsContext}
                                onChange={e => setGenQuestionsContext(e.target.value)}
                                className="w-full px-3 py-2.5 bg-white border border-purple-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 resize-none transition-all"
                                rows={3}
                                placeholder="Paste context — docs, feature description, FAQ — and AI will generate diverse test questions..."
                            />
                            <div className="flex items-center justify-between mt-3">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-purple-700 font-medium">Questions:</label>
                                    <input
                                        type="number"
                                        value={genQuestionsCount}
                                        onChange={e => setGenQuestionsCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                                        min={1} max={20}
                                        className="w-16 bg-white border border-purple-200 rounded-md px-2 py-1 text-sm text-center focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                                <button
                                    onClick={handleGenerateQuestions}
                                    disabled={genQuestionsRunning}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                >
                                    {genQuestionsRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Scoring Panel */}
                    {showScoringPanel && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <Star className="w-3.5 h-3.5" /> Scoring Rubric
                                    <span className="ml-1 text-amber-600 font-normal normal-case text-xs">· hover scores for justification</span>
                                </h3>
                                <button
                                    onClick={() => setEvalCriteria([...evalCriteria, { name: '', description: '', maxScore: 10 }])}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add Criterion
                                </button>
                            </div>
                            <div className="space-y-2">
                                {evalCriteria.map((c, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-amber-200">
                                        <input
                                            type="text"
                                            value={c.name}
                                            onChange={e => { const n = [...evalCriteria]; n[idx] = { ...n[idx], name: e.target.value }; setEvalCriteria(n); }}
                                            placeholder="Name"
                                            className="w-24 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs font-semibold focus:ring-1 focus:ring-amber-500"
                                        />
                                        <input
                                            type="text"
                                            value={c.description}
                                            onChange={e => { const n = [...evalCriteria]; n[idx] = { ...n[idx], description: e.target.value }; setEvalCriteria(n); }}
                                            placeholder="What to evaluate..."
                                            className="flex-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-amber-500"
                                        />
                                        <span className="text-xs text-gray-400 shrink-0">Max:</span>
                                        <input
                                            type="number"
                                            value={c.maxScore}
                                            onChange={e => { const n = [...evalCriteria]; n[idx] = { ...n[idx], maxScore: Math.max(1, Number(e.target.value)) }; setEvalCriteria(n); }}
                                            min={1} max={100}
                                            className="w-12 px-1 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-center focus:ring-1 focus:ring-amber-500"
                                        />
                                        <button onClick={() => setEvalCriteria(evalCriteria.filter((_, i) => i !== idx))} className="p-1 text-red-400 hover:bg-red-50 rounded transition-colors shrink-0">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {/* Harshness Meter */}
                            <div className="mt-4 pt-4 border-t border-amber-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Harshness Meter</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                        harshness <= 2 ? 'bg-green-100 text-green-700' :
                                        harshness <= 4 ? 'bg-lime-100 text-lime-700' :
                                        harshness <= 6 ? 'bg-amber-100 text-amber-700' :
                                        harshness <= 8 ? 'bg-orange-100 text-orange-700' :
                                        'bg-red-100 text-red-700'
                                    }`}>
                                        {harshness <= 2 ? 'Lenient' : harshness <= 4 ? 'Easy' : harshness <= 6 ? 'Balanced' : harshness <= 8 ? 'Strict' : 'Brutal'} · {harshness}/10
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={1} max={10} step={1}
                                    value={harshness}
                                    onChange={e => setHarshness(Number(e.target.value))}
                                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                    style={{
                                        background: `linear-gradient(to right, #22c55e 0%, #eab308 50%, #ef4444 100%)`,
                                    }}
                                />
                                <div className="flex justify-between text-[10px] text-amber-600 mt-1 font-medium">
                                    <span>Lenient</span>
                                    <span>Balanced</span>
                                    <span>Brutal</span>
                                </div>
                            </div>

                            {evalCriteria.length > 0 && (
                                <p className="text-xs text-amber-700 mt-3 font-medium">Total max: {maxTotalScore} pts · Harshness {harshness}/10</p>
                            )}
                        </div>
                    )}

                    {/* Saved collections (if any) */}
                    {testsets.length > 0 && !evalInputs.some(i => i.trim()) && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Copy className="w-3.5 h-3.5" /> Saved Collections — click to load
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {testsets.map((ts, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { setEvalInputs(ts.testset); setTestCaseResults({}); toast.success(`Loaded ${ts.testset.length} cases`); }}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium transition-colors"
                                    >
                                        Collection {i + 1} ({ts.testset.length} cases)
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Test Case Cards ── */}
                    <div className="space-y-3 pb-8">
                        {evalInputs.length === 0 || (evalInputs.length === 1 && !evalInputs[0]) ? (
                            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                                <FlaskRound className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium text-gray-500">No test cases yet</p>
                                <p className="text-xs mt-1 text-gray-400">Add cases manually, upload a CSV, or generate with AI above</p>
                            </div>
                        ) : (
                            evalInputs.map((input, idx) => {
                                const result = testCaseResults[idx];
                                const isRunning = result?.running;
                                const hasResult = result && !result.running;
                                const hasScores = hasResult && Object.keys(result.scores).length > 0;

                                return (
                                    <div
                                        key={idx}
                                        className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isRunning ? 'border-teal-300 shadow-teal-100' : hasResult && !result.error ? 'border-gray-200' : 'border-gray-200'}`}
                                    >
                                        {/* Input row */}
                                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                                            <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</div>
                                            <input
                                                type="text"
                                                value={input}
                                                onChange={e => {
                                                    const n = [...evalInputs];
                                                    n[idx] = e.target.value;
                                                    setEvalInputs(n);
                                                    // Clear result when input changes
                                                    if (testCaseResults[idx]) {
                                                        setTestCaseResults(prev => { const n = { ...prev }; delete n[idx]; return n; });
                                                    }
                                                }}
                                                placeholder="Enter test input..."
                                                className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-sm text-gray-800 font-medium placeholder-gray-300"
                                            />
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    onClick={() => handleRunSingle(idx)}
                                                    disabled={isRunning || runningAll}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg text-xs font-semibold hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                    {isRunning ? 'Running' : 'Run'}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEvalInputs(evalInputs.length > 1 ? evalInputs.filter((_, i) => i !== idx) : ['']);
                                                        setTestCaseResults(prev => { const n = { ...prev }; delete n[idx]; return n; });
                                                    }}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Running indicator */}
                                        {isRunning && (
                                            <div className="px-4 py-3 bg-gray-950 flex items-center gap-2">
                                                <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                                                <span className="text-xs text-gray-500 font-mono">Generating response{showScoringPanel && evalCriteria.length > 0 ? ' + scoring...' : '...'}</span>
                                            </div>
                                        )}

                                        {/* Error */}
                                        {hasResult && result.error && (
                                            <div className="px-4 py-3 bg-red-950/20 border-t border-red-900/30">
                                                <p className="text-xs text-red-400 font-medium font-mono">{result.error}</p>
                                            </div>
                                        )}

                                        {/* Response */}
                                        {hasResult && !result.error && (
                                            <>
                                                <div className="px-4 py-4 bg-gray-950">
                                                    <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap leading-relaxed">{result.response}</pre>
                                                </div>

                                                {/* Scores bar */}
                                                {hasScores && (
                                                    <div className="px-4 py-2.5 bg-gray-900 border-t border-gray-800 flex items-center gap-4 flex-wrap">
                                                        {evalCriteria.map(c => {
                                                            const s = result.scores[c.name];
                                                            if (!s) return null;
                                                            const pct = s.score / c.maxScore;
                                                            return (
                                                                <div key={c.name} className="flex items-center gap-1.5 cursor-help" title={s.justification}>
                                                                    <span className="text-xs text-gray-500">{c.name}</span>
                                                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pct >= 0.8 ? 'text-green-400 bg-green-900/50' : pct >= 0.5 ? 'text-amber-400 bg-amber-900/50' : 'text-red-400 bg-red-900/50'}`}>
                                                                        {s.score}/{c.maxScore}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                        {result.maxTotalScore > 0 && (
                                                            <div className="ml-auto flex items-center gap-1.5">
                                                                <BarChart2 className="w-3.5 h-3.5 text-gray-600" />
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${result.totalScore / result.maxTotalScore >= 0.8 ? 'text-green-400 bg-green-900/50' : result.totalScore / result.maxTotalScore >= 0.5 ? 'text-amber-400 bg-amber-900/50' : 'text-red-400 bg-red-900/50'}`}>
                                                                    {result.totalScore}/{result.maxTotalScore}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Prompt: enable scoring */}
                                                {!hasScores && !showScoringPanel && (
                                                    <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center gap-2">
                                                        <span className="text-xs text-gray-600">Enable</span>
                                                        <button onClick={() => setShowScoringPanel(true)} className="text-xs text-amber-500 hover:text-amber-400 font-semibold transition-colors">Scoring</button>
                                                        <span className="text-xs text-gray-600">to score responses</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ── Settings Modal ── */}
            {showSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16" onClick={() => setShowSettingsModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 p-6 space-y-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                <Settings className="w-4 h-4 text-purple-600" /> Model Settings
                            </h3>
                            <button onClick={() => setShowSettingsModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">AI Vendor</label>
                                <select
                                    value={testVendor}
                                    onChange={e => { setTestVendor(e.target.value); setTestModel(''); }}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 transition-all"
                                >
                                    <option value="">Select Vendor</option>
                                    {Object.entries(AI_MODELS).map(([key, val]) => (
                                        <option key={key} value={key}>{val.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Model</label>
                                <select
                                    value={testModel}
                                    onChange={e => setTestModel(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-50"
                                    disabled={!testVendor}
                                >
                                    <option value="">Choose Model</option>
                                    {testVendor && AI_MODELS[testVendor]?.models.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Advanced</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Temperature</label>
                                    <input type="number" value={temperature} onChange={e => setTemperature(Number(e.target.value))} min={0} max={2} step={0.1} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Max Tokens</label>
                                    <input type="number" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} min={1} max={8192} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Top P</label>
                                    <input type="number" value={topP} onChange={e => setTopP(Number(e.target.value))} min={0} max={1} step={0.1} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1 font-medium">Top K</label>
                                    <input type="number" value={topK} onChange={e => setTopK(Number(e.target.value))} min={-2} max={100} step={1} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 transition-all" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Context <span className="normal-case font-normal text-gray-400">(single prompt mode)</span></label>
                                <textarea
                                    value={testContext}
                                    onChange={e => setTestContext(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-purple-500 font-mono transition-all resize-none"
                                    rows={3}
                                    placeholder="System context injected before each query..."
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => setShowSettingsModal(false)}
                            className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold transition-colors"
                        >
                            Apply Settings
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
