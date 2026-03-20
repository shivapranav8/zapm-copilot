import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Clock, FileCheck, FileSpreadsheet, Send, X } from 'lucide-react';
import { FRDAuditInput } from './FRDAuditInput';
import { FRDAudit, AuditData } from './FRDAudit';
import { apiFetch } from '../../utils/apiFetch';
import { toast } from 'sonner';

interface FRDAuditPageProps {
  onBack: () => void;
  onSubmit: (file: File) => void;
  auditData: AuditData | null;
  isLoading?: boolean;
  progress?: number;
  progressMessage?: string;
}

interface HistoryItem {
  id: number;
  auditData: AuditData;
}

const STORAGE_KEY = 'zapm-frd-history';

function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveHistory(items: HistoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 10)));
}

export function FRDAuditPage({ onBack, onSubmit, auditData, isLoading = false, progress = 0, progressMessage = '' }: FRDAuditPageProps) {
  const [showInput, setShowInput] = useState(!auditData);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [displayedAudit, setDisplayedAudit] = useState<AuditData | null>(auditData);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCliqModal, setShowCliqModal] = useState(false);
  const [cliqMessage, setCliqMessage] = useState('');
  const [cliqSending, setCliqSending] = useState(false);

  // Sync incoming auditData prop (new audit just completed)
  useEffect(() => {
    if (!auditData) return;
    setDisplayedAudit(auditData);
    setSelectedId(null);

    setHistory(prev => {
      // Avoid duplicates within the same session
      if (prev.length > 0 && prev[0].auditData.fileName === auditData.fileName &&
          prev[0].auditData.analyzedDate === auditData.analyzedDate) return prev;
      const newItem: HistoryItem = { id: Date.now(), auditData };
      const updated = [newItem, ...prev];
      saveHistory(updated);
      return updated;
    });
  }, [auditData]);

  const handleSubmit = (file: File) => {
    onSubmit(file);
    setShowInput(false);
    setSelectedId(null);
  };

  const handleCliqSend = async () => {
    if (!displayedAudit) return;
    setCliqSending(true);
    try {
      const res = await apiFetch('/api/cliq/send-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditData: displayedAudit, message: cliqMessage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Failed to send');
      }
      toast.success('Audit report sent to Zoho Cliq!');
      setShowCliqModal(false);
      setCliqMessage('');
    } catch (err: any) {
      toast.error(`Failed to send to Cliq: ${err.message}`);
    } finally {
      setCliqSending(false);
    }
  };

  const handleHistoryClick = (item: HistoryItem) => {
    setSelectedId(item.id);
    setDisplayedAudit(item.auditData);
    setShowInput(false);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* History Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-lime-600 rounded-lg flex items-center justify-center">
              <FileCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">FRD Audit</h2>
              <p className="text-xs text-gray-500">Analyzer</p>
            </div>
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-lime-600 text-white rounded-lg hover:from-green-700 hover:to-lime-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Upload New FRD
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-700">Recent Audits</h3>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 px-2">No audits run yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleHistoryClick(item)}
                  className={`p-4 rounded-lg cursor-pointer transition-all border ${
                    selectedId === item.id
                      ? 'bg-green-50 border-green-300 shadow-sm'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedId === item.id ? 'bg-green-200' : 'bg-green-100'
                    }`}>
                      <FileSpreadsheet className={`w-4 h-4 ${
                        selectedId === item.id ? 'text-green-700' : 'text-green-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium mb-1 truncate ${
                        selectedId === item.id ? 'text-green-900' : 'text-gray-900'
                      }`}>
                        {item.auditData.fileName}
                      </h4>
                      <p className="text-xs text-gray-500 mb-2">{item.auditData.analyzedDate}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-1 rounded border ${
                          selectedId === item.id
                            ? 'text-green-700 bg-white border-green-200'
                            : 'text-gray-600 bg-white border-gray-200'
                        }`}>
                          {item.auditData.totalUseCases} use cases
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.auditData.summary.critical > 0
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-green-50 text-green-600 border border-green-200'
                        }`}>
                          {item.auditData.issues.length} issues
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {showInput ? (
          <div className="max-w-3xl mx-auto p-8">
            <FRDAuditInput
              onSubmit={handleSubmit}
              onClose={() => {
                setShowInput(false);
                if (!displayedAudit) {
                  onBack();
                }
              }}
            />
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-full max-w-sm px-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-lime-600 rounded-full flex items-center justify-center shadow-lg">
                  <FileCheck className="w-8 h-8 text-white" />
                </div>
                <svg className="absolute inset-0 w-16 h-16 animate-spin" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="30" fill="none" stroke="#16a34a" strokeWidth="3" strokeDasharray="40 150" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {progress < 35 ? 'Loading...' : 'Running AI review...'}
              </h3>
              <p className="text-sm text-gray-500 mb-4 min-h-[20px]">{progressMessage || 'Please wait...'}</p>
              {progress >= 95 && (
                <span className="inline-block text-sm font-medium text-green-600">Almost done...</span>
              )}
            </div>
          </div>
        ) : displayedAudit ? (
          <div className="max-w-5xl mx-auto p-8">
            <FRDAudit
              data={displayedAudit}
              onUpdate={(updatedData) => {
                setDisplayedAudit(updatedData);
                setHistory(prev => {
                  const updated = prev.map(h =>
                    h.auditData.fileName === updatedData.fileName &&
                    h.auditData.analyzedDate === updatedData.analyzedDate
                      ? { ...h, auditData: updatedData }
                      : h
                  );
                  saveHistory(updated);
                  return updated;
                });
                toast.success('Audit updated');
              }}
              onShare={() => setShowCliqModal(true)}
              onDownload={() => toast.success('Downloading audit report...')}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileCheck className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No FRD Selected</h3>
              <p className="text-sm text-gray-500 mb-4">Upload a new FRD or select from history</p>
              <button
                onClick={() => setShowInput(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Upload New FRD
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cliq Share Modal */}
      {showCliqModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Share via Zoho Cliq</h3>
              </div>
              <button onClick={() => setShowCliqModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Sends the audit summary for <span className="font-medium text-gray-700">{displayedAudit?.fileName}</span> to your configured Cliq channel.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Add a message (optional)</label>
              <textarea
                value={cliqMessage}
                onChange={e => setCliqMessage(e.target.value)}
                placeholder="e.g. Please review the critical issues before the next sprint..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCliqModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCliqSend}
                disabled={cliqSending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {cliqSending ? 'Sending...' : 'Send to Cliq'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
