import React, { useState } from 'react';
import { Save, Sparkles, Edit3, Check, X, AlertCircle, Clock, User, Loader2, RefreshCw } from 'lucide-react';

export interface ZohoDeskTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdDate: string;
  customerName: string;
  customerEmail: string;
  channel?: string;
  email?: string;
}

interface ZohoDeskTicketViewerProps {
  ticket: ZohoDeskTicket;
  generatedAnswer?: string;
  isGenerating?: boolean;
  onGenerateAnswer: (solution?: string) => void;
  onSaveAsDraft: () => void;
}

export function ZohoDeskTicketViewer({
  ticket,
  generatedAnswer,
  isGenerating,
  onGenerateAnswer,
  onSaveAsDraft,
}: ZohoDeskTicketViewerProps) {
  const [showSolution, setShowSolution] = useState(false);
  const [solution, setSolution] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState(generatedAnswer || '');
  const [regenerateNote, setRegenerateNote] = useState('');
  const [showRegenerateBox, setShowRegenerateBox] = useState(false);

  const handleGenerateWithSolution = () => {
    onGenerateAnswer(solution);
    setShowSolution(false);
    setSolution('');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'in progress':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'resolved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'closed':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Ticket Details Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-semibold text-gray-900">{ticket.subject}</h2>
                <span className="text-sm font-medium text-gray-500">#{ticket.ticketNumber}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(ticket.status)}`}>
                  {ticket.status}
                </span>
                <span className={`text-xs px-2 py-1 rounded border ${getPriorityColor(ticket.priority)}`}>
                  {ticket.priority} Priority
                </span>
                <span className="text-xs px-2 py-1 rounded border bg-gray-100 text-gray-700 border-gray-200">
                  {ticket.category}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ticket Info */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Customer</p>
                <p className="text-sm font-medium text-gray-900">{ticket.customerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Created</p>
                <p className="text-sm font-medium text-gray-900">{ticket.createdDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{ticket.customerEmail}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 py-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </div>

      {/* Generate Answer Section */}
      {!generatedAnswer && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Generate Support Response</h3>
            {!isGenerating && (
              <button
                onClick={() => setShowSolution(!showSolution)}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
              >
                <Edit3 className="w-4 h-4" />
                {showSolution ? 'Hide Notes' : 'Add Developer Notes'}
              </button>
            )}
          </div>

          {showSolution && !isGenerating && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Developer Notes (Optional)
              </label>
              <textarea
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="Add any technical context, known fixes, or workarounds...&#10;&#10;If left empty, the AI will use internal ticket comments as context."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent min-h-[120px] resize-vertical"
              />
              <p className="text-xs text-gray-500 mt-1">
                These notes override internal ticket comments as the technical source of truth.
              </p>
            </div>
          )}

          <button
            onClick={handleGenerateWithSolution}
            disabled={isGenerating}
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Response
              </>
            )}
          </button>
        </div>
      )}

      {/* Generated Answer */}
      {generatedAnswer && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Generated Response</h3>
              <p className="text-xs text-gray-500 mt-0.5">Review carefully before saving as draft</p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && (
                <>
                  <button
                    onClick={() => { setShowRegenerateBox(v => !v); }}
                    disabled={isGenerating}
                    className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </button>
                  <button
                    onClick={() => { setIsEditing(true); setEditedAnswer(generatedAnswer); }}
                    className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                </>
              )}
              <button
                onClick={onSaveAsDraft}
                className="px-3 py-1.5 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors flex items-center gap-1"
              >
                <Save className="w-4 h-4" />
                Save as Draft
              </button>
            </div>
          </div>

          {/* Safety banner */}
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            "Save as Draft" stores this in Zoho Desk as a draft only — it is <strong className="mx-1">never sent</strong> to the customer automatically.
          </div>

          <div className="px-6 py-4">
            {isEditing ? (
              <>
                <textarea
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent min-h-[300px] resize-vertical font-mono text-sm"
                />
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    Done
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setEditedAnswer(generatedAnswer); }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div
                className="text-sm text-gray-800 zoho-response-preview"
                dangerouslySetInnerHTML={{ __html: editedAnswer || generatedAnswer }}
              />
            )}
          </div>

          {/* Regenerate box */}
          {showRegenerateBox && !isEditing && (
            <div className="px-6 pb-5 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-600 mb-2">What should be different?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={regenerateNote}
                  onChange={(e) => setRegenerateNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isGenerating) {
                      onGenerateAnswer(regenerateNote || undefined);
                      setShowRegenerateBox(false);
                      setRegenerateNote('');
                    }
                  }}
                  placeholder="e.g. Focus on the feature request, be more concise..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={() => {
                    onGenerateAnswer(regenerateNote || undefined);
                    setShowRegenerateBox(false);
                    setRegenerateNote('');
                  }}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isGenerating ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}