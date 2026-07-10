'use client';

import { useState } from 'react';
import { Download, Mail, FileText, FileCode, X } from 'lucide-react';

interface SessionEndModalProps {
    sessionId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function SessionEndModal({ sessionId, isOpen, onClose }: SessionEndModalProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [emailToStudent, setEmailToStudent] = useState(false);
    const [downloadLinks, setDownloadLinks] = useState<{
        pdfUrl: string;
        markdownUrl: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const handleGenerateTranscript = async () => {
        setIsGenerating(true);
        setError(null);
        
        try {
            const response = await fetch(`/api/sessions/${sessionId}/transcript`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ emailToStudent })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate transcript');
            }
            
            setDownloadLinks({
                pdfUrl: data.pdfUrl,
                markdownUrl: data.markdownUrl
            });
        } catch (err: any) {
            setError(err.message);
            console.error('Failed to generate transcript:', err);
        } finally {
            setIsGenerating(false);
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <X size={24} />
                </button>
                
                <h2 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                    📝 Session Summary
                </h2>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    Your session has ended. Generate a transcript to save everything discussed!
                </p>
                
                {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                        ❌ {error}
                    </div>
                )}
                
                <div className="space-y-4">
                    {/* Email option */}
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={emailToStudent}
                            onChange={(e) => setEmailToStudent(e.target.checked)}
                            className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <Mail size={18} />
                        <span>Email transcript to student</span>
                    </label>
                    
                    {/* Generate button */}
                    <button
                        onClick={handleGenerateTranscript}
                        disabled={isGenerating}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin">⏳</span>
                                Generating...
                            </span>
                        ) : (
                            '🚀 Generate Transcript'
                        )}
                    </button>
                    
                    {/* Download buttons */}
                    {downloadLinks && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                                ✅ Transcript generated successfully!
                            </p>
                            <a
                                href={downloadLinks.pdfUrl}
                                download
                                className="flex items-center justify-center gap-2 w-full py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition border border-red-200 dark:border-red-800"
                            >
                                <FileText size={20} />
                                Download PDF
                            </a>
                            <a
                                href={downloadLinks.markdownUrl}
                                download
                                className="flex items-center justify-center gap-2 w-full py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition border border-blue-200 dark:border-blue-800"
                            >
                                <FileCode size={20} />
                                Download Markdown
                            </a>
                        </div>
                    )}
                </div>
                
                <button
                    onClick={onClose}
                    className="mt-6 w-full py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
                >
                    Close
                </button>
            </div>
        </div>
    );
}