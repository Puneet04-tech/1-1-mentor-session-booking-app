'use client';

import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, Download, BarChart3 } from 'lucide-react';

interface AuditLogEntry {
    id: string;
    eventType: string;
    eventData: any;
    previousHash: string;
    currentHash: string;
    createdAt: string;
}

interface AuditStats {
    total_events: number;
    unique_event_types: number;
    first_event: string;
    last_event: string;
    event_types: string[];
}

interface AuditVerification {
    isValid: boolean;
    tamperedEvents: string[];
    totalEvents: number;
    chainLength: number;
}

interface AuditDashboardProps {
    sessionId: string;
    userId: string;
    isMentor: boolean;
}

export default function AuditDashboard({ sessionId, userId, isMentor }: AuditDashboardProps) {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [verification, setVerification] = useState<AuditVerification | null>(null);
    const [stats, setStats] = useState<AuditStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAuditData();
    }, [sessionId]);

    const fetchAuditData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Fetch logs
            const logsRes = await fetch(`/api/audit/${sessionId}/logs`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const logsData = await logsRes.json();
            if (logsData.success) {
                setLogs(logsData.data);
            }

            // Fetch verification
            const verifyRes = await fetch(`/api/audit/${sessionId}/verify`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
                setVerification(verifyData.data);
            }

            // Fetch stats
            const statsRes = await fetch(`/api/audit/${sessionId}/stats`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const statsData = await statsRes.json();
            if (statsData.success) {
                setStats(statsData.data);
            }
        } catch (err) {
            setError('Failed to fetch audit data');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const exportAuditLog = async () => {
        try {
            const response = await fetch(`/api/audit/${sessionId}/export`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit_${sessionId}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Failed to export audit log:', error);
        }
    };

    const getEventTypeColor = (eventType: string) => {
        const colors: Record<string, string> = {
            'SESSION_JOIN': 'bg-green-100 text-green-800',
            'SESSION_LEAVE': 'bg-red-100 text-red-800',
            'CODE_CHANGE': 'bg-blue-100 text-blue-800',
            'CHAT_MESSAGE': 'bg-purple-100 text-purple-800',
            'VIDEO_EVENT': 'bg-yellow-100 text-yellow-800'
        };
        return colors[eventType] || 'bg-gray-100 text-gray-800';
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-t-2 border-purple-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center text-red-600 p-4">
                ❌ {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-purple-600" />
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        Audit Trail
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportAuditLog}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                    >
                        <Download size={18} />
                        Export JSON
                    </button>
                    <button
                        onClick={fetchAuditData}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Events</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total_events}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Event Types</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.unique_event_types}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Chain Length</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white">{verification?.chainLength || 0}</p>
                    </div>
                    <div className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow border ${verification?.isValid ? 'border-green-500' : 'border-red-500'}`}>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Integrity</p>
                        <div className="flex items-center gap-2">
                            {verification?.isValid ? (
                                <>
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                    <span className="text-green-600 dark:text-green-400 font-semibold">Valid</span>
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-red-500" />
                                    <span className="text-red-600 dark:text-red-400 font-semibold">Tampered</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Event Types */}
            {stats && stats.event_types.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {stats.event_types.map((type) => (
                        <span
                            key={type}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getEventTypeColor(type)}`}
                        >
                            {type}
                        </span>
                    ))}
                </div>
            )}

            {/* Logs Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Time
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Event
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Details
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Hash
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {formatDate(log.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEventTypeColor(log.eventType)}`}>
                                            {log.eventType}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                                        {JSON.stringify(log.eventData).slice(0, 100)}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                        {log.currentHash.slice(0, 16)}...
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        No audit events found for this session
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}