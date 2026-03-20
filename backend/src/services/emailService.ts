import nodemailer from 'nodemailer';

// Configure email service
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || '',
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

const emailTemplates: Record<string, (data: any) => string> = {
  'session-booked': (data) => `
    <h2>Session Booked Successfully!</h2>
    <p>Hi ${data.studentName},</p>
    <p>Your session with ${data.mentorName} has been confirmed for <strong>${data.sessionTime}</strong>.</p>
    <p><strong>Session Details:</strong></p>
    <ul>
      <li>Mentor: ${data.mentorName}</li>
      <li>Date & Time: ${data.sessionTime}</li>
      <li>Duration: ${data.duration} minutes</li>
      <li>Topic: ${data.topic}</li>
    </ul>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/session/${data.sessionId}">Join Session</a></p>
  `,

  'session-reminder': (data) => `
    <h2>Session Reminder</h2>
    <p>Hi ${data.studentName},</p>
    <p>Your session with ${data.mentorName} is coming up in 30 minutes!</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/session/${data.sessionId}">Join Now</a></p>
  `,

  'rating-received': (data) => `
    <h2>You Received a New Rating!</h2>
    <p>Hi ${data.mentorName},</p>
    <p>${data.studentName} left you a <strong>${data.rating}⭐</strong> rating after your session.</p>
    <p><strong>Feedback:</strong> "${data.comment}"</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/profile">View Your Profile</a></p>
  `,

  'session-ended': (data) => `
    <h2>Session Completed</h2>
    <p>Hi ${data.studentName},</p>
    <p>Your session with ${data.mentorName} has ended.</p>
    <p>Please take a moment to leave feedback and rate your experience.</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/sessions/history/${data.sessionId}">Leave Feedback</a></p>
  `,

  'new-message': (data) => `
    <h2>New Message from ${data.senderName}</h2>
    <p>You have a new message during your session.</p>
    <p><strong>Message:</strong> "${data.messagePreview}..."</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/session/${data.sessionId}">View Message</a></p>
  `,

  'welcome': (data) => `
    <h2>Welcome to Mentor Sessions! 👋</h2>
    <p>Hi ${data.userName},</p>
    <p>Thank you for joining our platform. Get started by exploring mentors or creating your first session.</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/dashboard">Go to Dashboard</a></p>
  `,

  'password-reset': (data) => `
    <h2>Reset Your Password</h2>
    <p>Hi ${data.userName},</p>
    <p>Click the link below to reset your password:</p>
    <p><a href="${process.env.NEXT_PUBLIC_API_URL}/reset-password?token=${data.resetToken}">Reset Password</a></p>
    <p>This link expires in 24 hours.</p>
  `,
};

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // Get template
    const template = emailTemplates[options.template];
    if (!template) {
      console.error(`Email template not found: ${options.template}`);
      return false;
    }

    const htmlContent = template(options.data);

    // Send email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@mentorsessions.com',
      to: options.to,
      subject: options.subject,
      html: htmlContent,
    });

    console.log(`✉️ Email sent to ${options.to}: ${info.response}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send multiple emails
 */
export async function sendBulkEmail(recipients: string[], template: string, data: Record<string, any>) {
  const results = await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: data.subject || 'Notification from Mentor Sessions',
        template,
        data,
      })
    )
  );

  return results.filter((r) => r).length;
}

/**
 * Queue email for later sending (useful for batch processing)
 */
export async function queueEmail(options: EmailOptions, delayMinutes: number = 0) {
  // TODO: Implement email queue using Bull or similar
  // For now, send immediately
  return sendEmail(options);
}
