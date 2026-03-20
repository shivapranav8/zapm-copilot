import { apiFetch } from '../../utils/apiFetch';
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Clock, Video, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MeetingInput } from './MeetingInput';
import { MeetingMoM, MeetingMoMData } from './MeetingMoM';

interface MeetingMoMPageProps {
  onBack: () => void;
  onSubmit: (data: { type: 'link' | 'video' | 'zoho'; value: string; title?: string; key?: string; transcriptUrl?: string }) => void;
  meetingMoMData: any;
  isLoading?: boolean;
  progress?: number;
  progressMessage?: string;
}

export function MeetingMoMPage({ onBack, onSubmit, meetingMoMData, isLoading, progress = 0, progressMessage = '' }: MeetingMoMPageProps) {
  const [showInput, setShowInput] = useState(!meetingMoMData);
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null);
  const [localMoMData, setLocalMoMData] = useState<MeetingMoMData | null>(meetingMoMData || null);

  const [history, setHistory] = useState<Array<{ id: string; title: string; date: string; actionItems: number }>>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/mom-history', { credentials: 'include' })
      .then(r => r.json())
      .then((data: any[]) => {
        setHistory(data.map(m => ({
          id: m.id,
          title: m.meetingTitle || 'Untitled Meeting',
          date: m.date || m.createdAt?.slice(0, 10) || '',
          actionItems: m.actionItems?.length ?? 0,
        })));
      })
      .catch(() => { })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (meetingMoMData) {
      setLocalMoMData(meetingMoMData);
      setShowInput(false);
      // Refresh history so the new MoM appears in the sidebar
      apiFetch('/api/mom-history', { credentials: 'include' })
        .then(r => r.json())
        .then((data: any[]) => {
          setHistory(data.map(m => ({
            id: m.id,
            title: m.meetingTitle || 'Untitled Meeting',
            date: m.date || m.createdAt?.slice(0, 10) || '',
            actionItems: m.actionItems?.length ?? 0,
          })));
        })
        .catch(() => { });
    }
  }, [meetingMoMData]);

  const handleSubmit = (data: { type: 'link' | 'video' | 'zoho'; value: string; title?: string; key?: string; transcriptUrl?: string }) => {
    onSubmit(data);
    setShowInput(false);
    setSelectedHistory(null);
  };

  const handleHistoryClick = (id: string) => {
    setSelectedHistory(id);
    setShowInput(false);
    apiFetch('/api/mom-history', { credentials: 'include' })
      .then(r => r.json())
      .then((data: any[]) => {
        const found = data.find(m => m.id === id);
        if (found) setLocalMoMData(found);
      })
      .catch(() => { });
  };

  const generateMarkdown = () => {
    if (!localMoMData) return '';
    return [
      `# ${localMoMData.meetingTitle}`,
      `Date: ${localMoMData.date} | Duration: ${localMoMData.duration}`,
      `Attendees: ${localMoMData.attendees.join(', ')}`,
      '',
      '## Summary',
      localMoMData.summary,
      '',
      '## Key Discussions',
      ...localMoMData.keyDiscussions.map(d => `- ${d}`),
      '',
      '## Decisions',
      ...localMoMData.decisions.map(d => `- ${d}`),
      '',
      '## Action Items',
      ...localMoMData.actionItems.map(a => `- [${a.priority}] ${a.task} — ${a.assignee} (Due: ${a.dueDate})`),
      ...(localMoMData.nextMeeting ? ['', '## Next Meeting', localMoMData.nextMeeting] : []),
    ].join('\n');
  };

  const handleDownload = () => {
    const content = generateMarkdown();
    if (!content || !localMoMData) return;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localMoMData.meetingTitle.replace(/\s+/g, '_')}_MoM.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const content = generateMarkdown();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast.success('MoM copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Home</span>
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Meeting MoM</h2>
              <p className="text-xs text-gray-500">Generator</p>
            </div>
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create New MoM
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent</h3>
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No meetings yet</p>
          ) : (
            <div className="space-y-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleHistoryClick(item.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedHistory === item.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${selectedHistory === item.id ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                      <FileText className={`w-3.5 h-3.5 ${selectedHistory === item.id ? 'text-blue-600' : 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${selectedHistory === item.id ? 'text-blue-900' : 'text-gray-800'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.date}</p>
                      <span className="text-xs text-gray-500">{item.actionItems} action items</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content — fills remaining width */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-md px-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Video className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {progress < 45 ? 'Downloading recording...' : progress < 80 ? 'Transcribing audio...' : 'Generating MoM...'}
              </h3>
              <p className="text-sm text-gray-500 mb-6">{progressMessage || 'Please wait...'}</p>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 overflow-hidden">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{progress}%</span>
                <span>{progress < 35 ? '⬇️ Downloading' : progress < 80 ? '🎙️ Transcribing' : '🤖 Generating'}</span>
              </div>

              <p className="text-xs text-gray-400 mt-6">You can switch tabs — we'll play a sound when it's ready.</p>
            </div>
          </div>
        ) : showInput ? (
          <div className="max-w-3xl mx-auto p-8">
            <MeetingInput
              onSubmit={handleSubmit}
              onClose={() => {
                setShowInput(false);
                if (!localMoMData) onBack();
              }}
            />
          </div>
        ) : localMoMData ? (
          <div className="p-6 h-full">
            <MeetingMoM
              data={localMoMData}
              onUpdate={(updated) => setLocalMoMData(updated)}
              onCopy={handleCopy}
              onDownload={handleDownload}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Video className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Meeting Selected</h3>
              <p className="text-sm text-gray-500 mb-4">Create a new MoM or select from history</p>
              <button
                onClick={() => setShowInput(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create New MoM
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
