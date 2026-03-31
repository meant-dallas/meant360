'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import toast from 'react-hot-toast';
import {
  HiOutlineFaceSmile,
  HiOutlineExclamationTriangle,
  HiOutlineBugAnt,
  HiOutlineLightBulb,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineFunnel,
} from 'react-icons/hi2';
import { SiGithub } from 'react-icons/si';

interface FeedbackItem {
  id: string;
  category: string;
  subject: string;
  message: string;
  submittedBy: string;
  submittedName: string;
  status: string;
  adminNotes: string;
  githubIssue: number | null;
  githubUrl: string;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; cls: string }> = {
  Praise: { icon: HiOutlineFaceSmile, cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  Concern: { icon: HiOutlineExclamationTriangle, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  Bug: { icon: HiOutlineBugAnt, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  'Feature Request': { icon: HiOutlineLightBulb, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  General: { icon: HiOutlineChatBubbleBottomCenterText, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};

const STATUS_OPTIONS = ['New', 'Reviewed', 'In Progress', 'Resolved', 'Closed'];
const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Reviewed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Closed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creatingIssue, setCreatingIssue] = useState<string | null>(null);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const res = await fetch(`/api/feedback?${params}`);
      const json = await res.json();
      if (json.success) setFeedback(json.data);
    } catch {
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
        toast.success('Status updated');
      } else {
        toast.error(json.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const createGitHubIssue = async (id: string) => {
    setCreatingIssue(id);
    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-github-issue', feedbackId: id }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, githubIssue: json.data.githubIssue, githubUrl: json.data.githubUrl, status: json.data.status }
              : f,
          ),
        );
        toast.success(`GitHub issue #${json.data.githubIssue} created`);
      } else {
        toast.error(json.error || 'Failed to create issue');
      }
    } catch {
      toast.error('Failed to create GitHub issue');
    } finally {
      setCreatingIssue(null);
    }
  };

  const filtered = categoryFilter === 'all' ? feedback : feedback.filter((f) => f.category === categoryFilter);

  const counts = {
    total: feedback.length,
    new: feedback.filter((f) => f.status === 'New').length,
    praise: feedback.filter((f) => f.category === 'Praise').length,
    concerns: feedback.filter((f) => f.category === 'Concern').length,
    bugs: feedback.filter((f) => f.category === 'Bug').length,
    features: feedback.filter((f) => f.category === 'Feature Request').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" description="Review and manage user feedback" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: counts.total, cls: 'text-gray-900 dark:text-gray-100' },
          { label: 'New', value: counts.new, cls: 'text-blue-600 dark:text-blue-400' },
          { label: 'Praise', value: counts.praise, cls: 'text-green-600 dark:text-green-400' },
          { label: 'Concerns', value: counts.concerns, cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Bugs', value: counts.bugs, cls: 'text-red-600 dark:text-red-400' },
          { label: 'Features', value: counts.features, cls: 'text-blue-600 dark:text-blue-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className={`text-2xl font-bold ${stat.cls}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <HiOutlineFunnel className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            {['all', ...STATUS_OPTIONS].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === s
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Category:</span>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            {['all', 'Praise', 'Concern', 'Bug', 'Feature Request', 'General'].map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  categoryFilter === c
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading feedback...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">No feedback found</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filtered.map((item) => {
              const catConfig = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.General;
              const CatIcon = catConfig.icon;
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    {/* Category icon */}
                    <div className={`p-2 rounded-lg flex-shrink-0 ${catConfig.cls}`}>
                      <CatIcon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {item.subject}
                        </h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {item.githubIssue && (
                            <a
                              href={item.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                              title={`GitHub #${item.githubIssue}`}
                            >
                              <SiGithub className="w-3.5 h-3.5" />
                              #{item.githubIssue}
                            </a>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${catConfig.cls}`}>
                            {item.category}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.New}`}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {item.submittedName} ({item.submittedBy}) &middot; {new Date(item.createdAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {!isExpanded && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{item.message}</p>
                      )}
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && (
                    <div className="mt-4 ml-12 space-y-4">
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.message}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Status update */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
                          <select
                            value={item.status}
                            onChange={(e) => updateStatus(item.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>

                        {/* Create GitHub issue */}
                        {!item.githubIssue ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              createGitHubIssue(item.id);
                            }}
                            disabled={creatingIssue === item.id}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <SiGithub className="w-3.5 h-3.5" />
                            {creatingIssue === item.id ? 'Creating...' : 'Create GitHub Issue'}
                          </button>
                        ) : (
                          <a
                            href={item.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                          >
                            <SiGithub className="w-3.5 h-3.5" />
                            View Issue #{item.githubIssue}
                            <HiOutlineArrowTopRightOnSquare className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
