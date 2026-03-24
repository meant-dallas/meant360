import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireAuth, requireAdmin, validateBody, getSessionRole } from '@/lib/api-helpers';
import { feedbackSubmitSchema, feedbackUpdateSchema } from '@/types/schemas';
import { prisma } from '@/lib/db';
import { logActivity } from '@/lib/audit-log';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

// GET - List feedback (admin/committee: all, members: own)
export async function GET(request: NextRequest) {
  const { role, email, authenticated } = await getSessionRole();
  if (!authenticated || !role) return errorResponse('Unauthorized', 401);

  try {
    const status = request.nextUrl.searchParams.get('status');
    const isAdmin = role === 'admin' || role === 'committee';

    const where: Record<string, unknown> = {};
    if (!isAdmin) where.submittedBy = email;
    if (status && status !== 'all') where.status = status;

    const feedback = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return jsonResponse(feedback);
  } catch (error) {
    console.error('GET /api/feedback error:', error);
    Sentry.captureException(error, { extra: { context: 'Feedback GET' } });
    return errorResponse('Failed to fetch feedback', 500, error);
  }
}

// POST - Submit new feedback (any authenticated user)
export async function POST(request: NextRequest) {
  const { role, email, authenticated } = await getSessionRole();
  if (!authenticated || !role) return errorResponse('Unauthorized', 401);

  try {
    const body = await request.json();
    const validated = await validateBody(feedbackSubmitSchema, body);
    if (validated instanceof NextResponse) return validated;

    const { category, subject, message } = validated as {
      category: string;
      subject: string;
      message: string;
    };

    const session = await getServerSession(authOptions);
    const userName = session?.user?.name || email;

    const feedback = await prisma.feedback.create({
      data: {
        category,
        subject,
        message,
        submittedBy: email,
        submittedName: userName,
      },
    });

    logActivity({
      userEmail: email,
      action: 'create',
      entityType: 'Feedback',
      entityId: feedback.id,
      entityLabel: subject,
      description: `Submitted ${category} feedback: ${subject}`,
    });

    return jsonResponse(feedback, 201);
  } catch (error) {
    console.error('POST /api/feedback error:', error);
    Sentry.captureException(error, { extra: { context: 'Feedback POST' } });
    return errorResponse('Failed to submit feedback', 500, error);
  }
}

// PUT - Update feedback status / create GitHub issue (admin only)
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { action } = body;

    // Create GitHub issue from feedback
    if (action === 'create-github-issue') {
      const feedbackId = body.feedbackId;
      if (!feedbackId) return errorResponse('feedbackId is required');

      const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
      if (!feedback) return errorResponse('Feedback not found', 404);
      if (feedback.githubIssue) return errorResponse('GitHub issue already exists for this feedback');

      const { createIssue } = await import('@/lib/github');

      const typeLabel = feedback.category === 'Bug' ? 'bug'
        : feedback.category === 'Feature Request' ? 'feature'
        : feedback.category === 'Concern' ? 'concern'
        : feedback.category === 'Praise' ? 'praise'
        : 'feedback';
      const labels = [typeLabel];

      const issueBody = `**Category:** ${feedback.category}\n**Submitted by:** ${feedback.submittedName} (${feedback.submittedBy})\n**Date:** ${feedback.createdAt.toLocaleDateString()}\n\n## Description\n${feedback.message}`;

      const issue = await createIssue(feedback.subject, issueBody, labels);

      const updated = await prisma.feedback.update({
        where: { id: feedbackId },
        data: {
          githubIssue: issue.number,
          githubUrl: issue.html_url,
          status: feedback.status === 'New' ? 'Reviewed' : feedback.status,
        },
      });

      logActivity({
        userEmail: auth.email,
        action: 'update',
        entityType: 'Feedback',
        entityId: feedbackId,
        entityLabel: feedback.subject,
        description: `Created GitHub issue #${issue.number} from feedback`,
      });

      return jsonResponse(updated);
    }

    // Regular status/notes update
    const validated = await validateBody(feedbackUpdateSchema, body);
    if (validated instanceof NextResponse) return validated;

    const { id, ...data } = validated as { id: string; status?: string; adminNotes?: string };

    const updated = await prisma.feedback.update({
      where: { id },
      data,
    });

    logActivity({
      userEmail: auth.email,
      action: 'update',
      entityType: 'Feedback',
      entityId: id,
      entityLabel: updated.subject,
      description: `Updated feedback status to ${updated.status}`,
    });

    return jsonResponse(updated);
  } catch (error) {
    console.error('PUT /api/feedback error:', error);
    Sentry.captureException(error, { extra: { context: 'Feedback PUT' } });
    return errorResponse('Failed to update feedback', 500, error);
  }
}
