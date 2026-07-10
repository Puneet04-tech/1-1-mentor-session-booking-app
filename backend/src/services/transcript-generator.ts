import { query } from '../database';
import { getChatMessages } from './chat';
import { getCodeSnapshot } from './code-editor';
import * as fs from 'fs';
import * as path from 'path';

export interface ChatMessage {
    timestamp: string;
    sender: string;
    message: string;
}

export interface CodeSnapshot {
    language: string;
    content: string;
    changeHistory: any[];
}

export interface TranscriptData {
    sessionId: string;
    mentor: string;
    student: string;
    startTime: Date;
    endTime: Date;
    duration: string;
    chatTranscript: ChatMessage[];
    codeSnapshot: CodeSnapshot;
}

export class TranscriptGenerator {
    private sessionId: string;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
    }

    async generateTranscript(): Promise<TranscriptData> {
        console.log('📝 Generating transcript for session:', this.sessionId);

        // 1. Get session details
        const session = await this.getSessionDetails();
        
        // 2. Fetch all chat messages
        const messages = await this.getChatMessages();
        
        // 3. Get final code state from Yjs
        const codeSnapshot = await this.getCodeSnapshot();
        
        // 4. Calculate duration
        const duration = this.calculateDuration(session.start_time, session.end_time);
        
        const transcript: TranscriptData = {
            sessionId: this.sessionId,
            mentor: session.mentor_name,
            student: session.student_name,
            startTime: session.start_time,
            endTime: session.end_time,
            duration,
            chatTranscript: messages,
            codeSnapshot
        };
        
        return transcript;
    }

    private async getSessionDetails() {
        const result = await query(
            `SELECT 
                s.*,
                m.name as mentor_name,
                st.name as student_name
            FROM sessions s
            JOIN users m ON s.mentor_id = m.id
            JOIN users st ON s.student_id = st.id
            WHERE s.id = $1`,
            [this.sessionId]
        );
        
        if (result.rows.length === 0) {
            throw new Error('Session not found');
        }
        
        return result.rows[0];
    }

    private async getChatMessages(): Promise<ChatMessage[]> {
        const result = await query(
            `SELECT 
                c.message,
                c.created_at,
                u.name as sender
            FROM chat_messages c
            JOIN users u ON c.sender_id = u.id
            WHERE c.session_id = $1
            ORDER BY c.created_at ASC`,
            [this.sessionId]
        );
        
        return result.rows.map((row: any) => ({
            timestamp: this.formatTime(row.created_at),
            sender: row.sender,
            message: row.message
        }));
    }

    private async getCodeSnapshot(): Promise<CodeSnapshot> {
        // Get from Yjs or database
        try {
            const result = await query(
                `SELECT 
                    language,
                    code_content,
                    change_history
                FROM code_snapshots
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT 1`,
                [this.sessionId]
            );
            
            if (result.rows.length > 0) {
                return {
                    language: result.rows[0].language || 'javascript',
                    content: result.rows[0].code_content || '',
                    changeHistory: result.rows[0].change_history || []
                };
            }
        } catch (error) {
            console.warn('No code snapshot found, using empty state');
        }
        
        return {
            language: 'javascript',
            content: '// No code was written during this session',
            changeHistory: []
        };
    }

    private calculateDuration(start: Date, end: Date): string {
        if (!start || !end) return 'Unknown';
        const diff = end.getTime() - start.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes} minutes`;
    }

    private formatTime(date: Date): string {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    async generateAndStore(): Promise<{ pdfPath: string; markdownPath: string }> {
        const transcript = await this.generateTranscript();
        
        // Generate PDF and Markdown
        const pdfPath = await this.generatePDF(transcript);
        const markdownPath = await this.generateMarkdown(transcript);
        
        // Store in database
        await this.storeTranscript(transcript, pdfPath, markdownPath);
        
        return { pdfPath, markdownPath };
    }

    private async generatePDF(transcript: TranscriptData): Promise<string> {
        // Simple HTML to PDF conversion using template
        const html = this.generatePDFHTML(transcript);
        const filename = `transcript_${this.sessionId}_${Date.now()}.pdf`;
        const filepath = path.join(__dirname, '../uploads/transcripts', filename);
        
        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // For now, save as HTML (will be converted to PDF later)
        fs.writeFileSync(filepath.replace('.pdf', '.html'), html);
        
        return filepath;
    }

    private generatePDFHTML(transcript: TranscriptData): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { color: #8B5CF6; border-bottom: 2px solid #8B5CF6; padding-bottom: 10px; }
        h2 { color: #22C55E; margin-top: 30px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .message { padding: 8px 12px; margin: 4px 0; background: #f3f4f6; border-radius: 4px; }
        .sender { font-weight: bold; color: #8B5CF6; }
        .timestamp { color: #6b7280; font-size: 0.8em; }
        pre { background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 8px; overflow-x: auto; }
        .meta { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .code-header { background: #374151; color: #f3f4f6; padding: 8px 12px; border-radius: 8px 8px 0 0; }
    </style>
</head>
<body>
    <h1>📝 Mentoring Session Transcript</h1>
    
    <div class="meta">
        <p><strong>Session ID:</strong> ${transcript.sessionId}</p>
        <p><strong>Mentor:</strong> ${transcript.mentor}</p>
        <p><strong>Student:</strong> ${transcript.student}</p>
        <p><strong>Duration:</strong> ${transcript.duration}</p>
        <p><strong>Date:</strong> ${new Date(transcript.startTime).toLocaleDateString()}</p>
    </div>
    
    <h2>💬 Chat Transcript</h2>
    ${transcript.chatTranscript.map(msg => `
        <div class="message">
            <span class="timestamp">[${msg.timestamp}]</span>
            <span class="sender">${msg.sender}:</span>
            ${msg.message}
        </div>
    `).join('')}
    
    <h2>💻 Code Snapshot</h2>
    <div class="code-header">Language: ${transcript.codeSnapshot.language}</div>
    <pre><code>${transcript.codeSnapshot.content}</code></pre>
</body>
</html>
        `;
    }

    private async generateMarkdown(transcript: TranscriptData): Promise<string> {
        let markdown = `# 📝 Mentoring Session Transcript\n\n`;
        markdown += `## Session Details\n\n`;
        markdown += `- **Session ID:** ${transcript.sessionId}\n`;
        markdown += `- **Mentor:** ${transcript.mentor}\n`;
        markdown += `- **Student:** ${transcript.student}\n`;
        markdown += `- **Duration:** ${transcript.duration}\n`;
        markdown += `- **Date:** ${new Date(transcript.startTime).toLocaleDateString()}\n\n`;
        
        markdown += `## 💬 Chat Transcript\n\n`;
        transcript.chatTranscript.forEach(msg => {
            markdown += `**[${msg.timestamp}] ${msg.sender}:** ${msg.message}\n\n`;
        });
        
        markdown += `## 💻 Code Snapshot\n\n`;
        markdown += `**Language:** ${transcript.codeSnapshot.language}\n\n`;
        markdown += `\`\`\`${transcript.codeSnapshot.language}\n`;
        markdown += transcript.codeSnapshot.content;
        markdown += `\n\`\`\`\n`;
        
        const filename = `transcript_${this.sessionId}_${Date.now()}.md`;
        const filepath = path.join(__dirname, '../uploads/transcripts', filename);
        
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filepath, markdown);
        
        return filepath;
    }

    private async storeTranscript(transcript: TranscriptData, pdfPath: string, markdownPath: string) {
        await query(
            `INSERT INTO session_transcripts (
                session_id,
                transcript_data,
                pdf_url,
                markdown_url,
                generated_at
            ) VALUES ($1, $2, $3, $4, NOW())`,
            [
                this.sessionId,
                JSON.stringify(transcript),
                pdfPath,
                markdownPath
            ]
        );
        
        // Update sessions table
        await query(
            `UPDATE sessions SET transcript_generated_at = NOW() WHERE id = $1`,
            [this.sessionId]
        );
    }
}