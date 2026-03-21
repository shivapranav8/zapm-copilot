import React from 'react';
import { Sparkles, MessageSquare, PenLine, Users, Code, TicketCheck, FileSpreadsheet, FileCheck, FlaskRound } from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
}

interface HomePageProps {
  onToolSelect: (toolId: 'pm-buddy' | 'community-ticket' | 'prd-generator' | 'meeting-mom' | 'frd-audit' | 'genqa') => void;
}

export function HomePage({ onToolSelect }: HomePageProps) {
  const tools: Tool[] = [
    {
      id: 'pm-buddy',
      name: 'PM Buddy',
      description: 'Create comprehensive product documentation with competitor analysis, MRDs, FRDs, and implementation guides',
      icon: <Sparkles className="w-8 h-8" />,
      color: 'text-purple-600',
      gradient: 'from-purple-600 to-blue-600',
    },
    {
      id: 'meeting-mom',
      name: 'Meeting MoM Generator',
      description: 'Upload meeting links or videos to generate comprehensive minutes with action items',
      icon: <Users className="w-8 h-8" />,
      color: 'text-blue-600',
      gradient: 'from-blue-600 to-cyan-600',
    },
    {
      id: 'community-ticket',
      name: 'Community Ticket Generator',
      description: 'Generate detailed support tickets for community forums with reproduction steps and environment details',
      icon: <TicketCheck className="w-8 h-8" />,
      color: 'text-orange-600',
      gradient: 'from-orange-600 to-red-600',
    },
    {
      id: 'prd-generator',
      name: 'PRD Generator',
      description: 'Upload ZIP file containing project documentation to generate a comprehensive PRD as Excel/CSV',
      icon: <FileSpreadsheet className="w-8 h-8" />,
      color: 'text-indigo-600',
      gradient: 'from-indigo-600 to-purple-600',
    },
    {
      id: 'frd-audit',
      name: 'FRD Audit',
      description: 'Upload FRD Excel files to analyze use cases, requirements, and data sheets. Get comprehensive suggestions for improvements',
      icon: <FileCheck className="w-8 h-8" />,
      color: 'text-green-600',
      gradient: 'from-green-600 to-lime-600',
    },
    {
      id: 'genqa',
      name: 'AI Evals Studio',
      description: 'Manage, version, test, and refine AI prompts with PlatformAI integration and test case management',
      icon: <FlaskRound className="w-8 h-8" />,
      color: 'text-teal-600',
      gradient: 'from-teal-600 to-emerald-600',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl mb-6 shadow-lg">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl text-gray-900 mb-3">ZA - PM Co Pilot</h1>
          <p className="text-lg text-gray-600">
            Multi-tool AI Assistant Hub - Choose a tool to streamline your workflow
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => onToolSelect(tool.id as any)}
              className="group bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-transparent hover:border-purple-200"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-14 h-14 bg-gradient-to-br ${tool.gradient} rounded-xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-300`}
                >
                  {tool.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">
                      {tool.name}
                    </h3>
                    {tool.id === 'pm-buddy' && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                        Beta
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Launch tool</span>
                <svg
                  className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">All tools are AI-powered and ready to use</span>
          </div>
        </div>
      </div>
    </div>
  );
}