'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { formatDate, daysUntilCST } from '@/lib/utils';
import {
  HiOutlineBuildingOffice2,
  HiOutlineIdentification,
  HiOutlineMapPin,
  HiOutlineUserGroup,
  HiOutlineShieldCheck,
  HiOutlineDocumentText,
  HiOutlineCalendarDays,
  HiOutlineArchiveBox,
  HiOutlineClipboardDocumentList,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlinePlusCircle,
  HiOutlineArrowUpTray,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
} from 'react-icons/hi2';

// ========================================
// Types
// ========================================

interface OrgInfo { [key: string]: string; }
interface Officer { id: string; name: string; role: string; group: string; email: string; phone: string; startDate: string; endDate: string; status: string; portalRole: string; }
interface Filing { id: string; filingType: string; filingYear: string; filedDate: string; filedBy: string; confirmationNumber: string; status: string; documentUrl: string; documentFileId: string; notes: string; }
interface OrgDoc { id: string; name: string; category: string; description: string; currentVersion: string; currentFileUrl: string; currentFileId: string; expiryDate: string; status: string; uploadedBy: string; createdAt: string; updatedAt: string; }
interface DocVersion { id: string; documentId: string; version: string; fileUrl: string; fileId: string; fileName: string; fileSize: string; uploadedBy: string; uploadedAt: string; notes: string; }
interface AuditEntry { id: string; timestamp: string; userEmail: string; action: string; entityType: string; entityId: string; entityLabel: string; description: string; changedFields: string; oldValues: string; newValues: string; }

const OFFICER_GROUPS = ['', 'BoD', 'Chair'] as const;
const FILING_TYPES = ['IRS Form 990', 'IRS Form 990-EZ', 'IRS Form 990-N', 'Texas Franchise Tax Report', 'Public Information Report', 'Annual Report', 'Other'] as const;
const DOC_CATEGORIES = ['Tax', 'Legal', 'Compliance', 'Insurance', 'Financial', 'Governance', 'Other'] as const;

// ========================================
// Reusable UI Components
// ========================================

function SectionCard({ id, icon: Icon, title, action, children }: {
  id?: string; icon: React.ElementType; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div id={id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center gap-2.5">
          <Icon className="w-4.5 h-4.5 text-gray-400 dark:text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{value || '\u2014'}</dd>
    </div>
  );
}

function EditableField({ label, value, onChange, type = 'text', options, multiline, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; options?: readonly string[]; multiline?: boolean; placeholder?: string;
}) {
  const cls = 'w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-colors';
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select...</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder} className={cls} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}


function Badge({ variant, children }: { variant: 'green' | 'yellow' | 'red' | 'blue' | 'gray'; children: React.ReactNode }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-400/20',
    yellow: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-400/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-400/20',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-400 dark:ring-blue-400/20',
    gray: 'bg-gray-50 text-gray-600 ring-gray-500/10 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-400/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${styles[variant]}`}>
      {children}
    </span>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md transition-colors">
      <HiOutlinePencilSquare className="w-3.5 h-3.5" /> Edit
    </button>
  );
}

function SaveCancelButtons({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCancel} className="px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md">Cancel</button>
      <button onClick={onSave} disabled={saving} className="px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50">
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

function complianceColor(status: string): 'green' | 'yellow' | 'red' | 'gray' {
  const s = status.toLowerCase();
  if (['active', 'good standing', 'filed'].includes(s)) return 'green';
  if (['warning', 'pending', 'delinquent'].includes(s)) return 'yellow';
  if (['revoked', 'forfeited', 'inactive', 'overdue'].includes(s)) return 'red';
  return 'gray';
}


function formatFileSize(bytes: string | number) {
  const b = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (!b || isNaN(b)) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ========================================
// Main Page
// ========================================

export default function OrganizationPage() {
  const { data: session } = useSession();
  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';

  // ---- State ----
  const [orgInfo, setOrgInfo] = useState<OrgInfo>({});
  const [infoLoading, setInfoLoading] = useState(true);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [documents, setDocuments] = useState<OrgDoc[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Edit states
  const [editSection, setEditSection] = useState<string | null>(null);
  const [infoForm, setInfoForm] = useState<OrgInfo>({});
  const [saving, setSaving] = useState(false);

  // Officer modal
  const [officerModalOpen, setOfficerModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [officerForm, setOfficerForm] = useState({ name: '', role: '', group: '', email: '', phone: '', startDate: '', endDate: '', status: 'Active', portalRole: '' });

  // Filing modal
  const [filingModalOpen, setFilingModalOpen] = useState(false);
  const [editingFiling, setEditingFiling] = useState<Filing | null>(null);
  const [filingForm, setFilingForm] = useState({ filingType: '', filingYear: '', filedDate: '', filedBy: '', confirmationNumber: '', status: 'Pending', notes: '' });
  const [filingUploadFile, setFilingUploadFile] = useState<File | null>(null);

  // Document modal
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<OrgDoc | null>(null);
  const [docForm, setDocForm] = useState({ name: '', category: 'Other', description: '', expiryDate: '' });

  // Upload modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocId, setUploadDocId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  // Version history
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionDoc, setVersionDoc] = useState<OrgDoc | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Reminders
  const [sendingReminder, setSendingReminder] = useState(false);

  // ---- Fetchers ----
  const fetchOrgInfo = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await fetch('/api/org/info');
      const json = await res.json();
      if (json.success) setOrgInfo(json.data || {});
    } catch { toast.error('Failed to load organization info'); }
    finally { setInfoLoading(false); }
  }, []);

  const fetchOfficers = useCallback(async () => {
    try {
      const res = await fetch('/api/org/officers');
      const json = await res.json();
      if (json.success) setOfficers(json.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchFilings = useCallback(async () => {
    try {
      const res = await fetch('/api/org/filings');
      const json = await res.json();
      if (json.success) setFilings(json.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/org/documents');
      const json = await res.json();
      if (json.success) setDocuments(json.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch('/api/activity-log?entityType=OrgInfo,OrgOfficer,OrgFiling,OrgDocument&limit=50');
      const json = await res.json();
      if (json.success) setAuditLog(json.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchOrgInfo(); fetchOfficers(); fetchFilings(); fetchDocuments(); fetchAuditLog(); }, [fetchOrgInfo, fetchOfficers, fetchFilings, fetchDocuments, fetchAuditLog]);

  // ---- Info Editing ----
  const startEdit = (section: string) => { setInfoForm({ ...orgInfo }); setEditSection(section); };
  const cancelEdit = () => setEditSection(null);
  const updateField = (f: string, v: string) => setInfoForm((p) => ({ ...p, [f]: v }));

  const saveInfo = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/org/info', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(infoForm) });
      const json = await res.json();
      if (json.success) { setOrgInfo(json.data); setEditSection(null); toast.success('Saved'); fetchAuditLog(); }
      else toast.error(json.error || 'Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  // ---- Officers ----
  const openOfficerModal = (o?: Officer) => {
    setEditingOfficer(o || null);
    setOfficerForm(o ? { name: o.name, role: o.role, group: o.group || '', email: o.email, phone: o.phone, startDate: o.startDate, endDate: o.endDate, status: o.status, portalRole: o.portalRole || '' } : { name: '', role: '', group: '', email: '', phone: '', startDate: '', endDate: '', status: 'Active', portalRole: '' });
    setOfficerModalOpen(true);
  };

  const saveOfficer = async () => {
    if (!officerForm.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const method = editingOfficer ? 'PUT' : 'POST';
      const body = editingOfficer ? { id: editingOfficer.id, ...officerForm } : officerForm;
      const res = await fetch('/api/org/officers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { toast.success(editingOfficer ? 'Updated' : 'Added'); setOfficerModalOpen(false); fetchOfficers(); fetchAuditLog(); }
      else toast.error(json.error || 'Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const deleteOfficer = async (o: Officer) => {
    if (!confirm(`Remove ${o.name}?`)) return;
    try {
      const res = await fetch(`/api/org/officers?id=${o.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Removed'); fetchOfficers(); fetchAuditLog(); }
    } catch { toast.error('Delete failed'); }
  };

  // ---- Filings ----
  const openFilingModal = (f?: Filing) => {
    setEditingFiling(f || null);
    setFilingForm(f ? { filingType: f.filingType, filingYear: f.filingYear, filedDate: f.filedDate, filedBy: f.filedBy, confirmationNumber: f.confirmationNumber, status: f.status, notes: f.notes } : { filingType: '', filingYear: new Date().getFullYear().toString(), filedDate: '', filedBy: '', confirmationNumber: '', status: 'Pending', notes: '' });
    setFilingUploadFile(null);
    setFilingModalOpen(true);
  };

  const saveFiling = async () => {
    if (!filingForm.filingType) { toast.error('Filing type is required'); return; }
    setSaving(true);
    try {
      const method = editingFiling ? 'PUT' : 'POST';
      const body = editingFiling ? { id: editingFiling.id, ...filingForm } : filingForm;
      const res = await fetch('/api/org/filings', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) {
        // Upload document if provided
        if (filingUploadFile) {
          const fd = new FormData();
          fd.append('file', filingUploadFile);
          fd.append('filingId', editingFiling ? editingFiling.id : json.data.id);
          await fetch('/api/org/filings/upload', { method: 'POST', body: fd });
        }
        toast.success(editingFiling ? 'Updated' : 'Added');
        setFilingModalOpen(false);
        fetchFilings();
        fetchAuditLog();
      } else toast.error(json.error || 'Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const deleteFiling = async (f: Filing) => {
    if (!confirm(`Delete ${f.filingType} ${f.filingYear}?`)) return;
    try {
      const res = await fetch(`/api/org/filings?id=${f.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Deleted'); fetchFilings(); fetchAuditLog(); }
    } catch { toast.error('Delete failed'); }
  };

  // ---- Documents ----
  const openDocModal = (d?: OrgDoc) => {
    setEditingDoc(d || null);
    setDocForm(d ? { name: d.name, category: d.category, description: d.description, expiryDate: d.expiryDate } : { name: '', category: 'Other', description: '', expiryDate: '' });
    setDocModalOpen(true);
  };

  const saveDoc = async () => {
    if (!docForm.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const method = editingDoc ? 'PUT' : 'POST';
      const body = editingDoc ? { id: editingDoc.id, ...docForm } : docForm;
      const res = await fetch('/api/org/documents', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { toast.success(editingDoc ? 'Updated' : 'Created'); setDocModalOpen(false); fetchDocuments(); fetchAuditLog(); }
      else toast.error(json.error || 'Save failed');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const deleteDoc = async (d: OrgDoc) => {
    if (!confirm(`Delete "${d.name}" and all versions?`)) return;
    try {
      const res = await fetch(`/api/org/documents?id=${d.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { toast.success('Deleted'); fetchDocuments(); fetchAuditLog(); }
    } catch { toast.error('Delete failed'); }
  };

  const openUpload = (docId: string) => { setUploadDocId(docId); setUploadFile(null); setUploadNotes(''); setUploadModalOpen(true); };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('Select a file'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('documentId', uploadDocId);
      fd.append('notes', uploadNotes);
      const res = await fetch('/api/org/documents/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) { toast.success('Uploaded'); setUploadModalOpen(false); fetchDocuments(); fetchAuditLog(); }
      else toast.error(json.error || 'Upload failed');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const openVersions = async (d: OrgDoc) => {
    setVersionDoc(d); setVersionModalOpen(true); setVersionsLoading(true);
    try {
      const res = await fetch(`/api/org/documents?documentId=${d.id}`);
      const json = await res.json();
      if (json.success) setVersions(json.data || []);
    } catch { toast.error('Failed to load versions'); }
    finally { setVersionsLoading(false); }
  };

  // ---- Reminders ----
  const sendDeadlineReminder = async (deadlineKey?: string) => {
    setSendingReminder(true);
    try {
      const res = await fetch('/api/org/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline: deadlineKey }),
      });
      const json = await res.json();
      if (json.success) {
        const names = json.data.recipients.map((r: { name: string; role: string }) => `${r.name} (${r.role})`).join(', ');
        toast.success(`Reminder sent to ${names}`);
        fetchAuditLog();
      } else {
        toast.error(json.error || 'Failed to send reminder');
      }
    } catch { toast.error('Failed to send reminder'); }
    finally { setSendingReminder(false); }
  };

  // ---- Compliance Health ----
  const complianceItems = useMemo(() => [
    { label: 'IRS Status', value: orgInfo.irsStatus },
    { label: 'Texas Franchise Tax', value: orgInfo.franchiseTaxStatus },
    { label: 'Texas SOS Registration', value: orgInfo.sosRegistrationStatus },
  ], [orgInfo]);

  const healthScore = useMemo(() => {
    const items = complianceItems.filter((i) => i.value);
    if (items.length === 0) return null;
    const score = items.reduce((sum, i) => sum + (complianceColor(i.value) === 'green' ? 1 : 0), 0);
    return Math.round((score / items.length) * 100);
  }, [complianceItems]);

  const deadlines = useMemo(() => [
    { key: 'franchiseTaxDueDate', label: 'Texas Franchise Tax Report', date: orgInfo.franchiseTaxDueDate },
    { key: 'publicInfoReportDueDate', label: 'Public Information Report', date: orgInfo.publicInfoReportDueDate },
    { key: 'irs990DueDate', label: 'IRS Form 990', date: orgInfo.irs990DueDate },
  ].filter((d) => d.date), [orgInfo]);

  // ---- Render ----
  if (infoLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading organization profile...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ===== Page Header ===== */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              Organization Compliance & Legal Profile
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Manage legal identity, compliance status, filings, and documents
            </p>
          </div>
          {healthScore !== null && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}>
                {healthScore}
              </div>
              <div>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Compliance</div>
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {healthScore >= 80 ? 'Good Standing' : healthScore >= 50 ? 'Needs Attention' : 'Critical'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Section Navigation ===== */}
      <nav className="flex flex-wrap gap-1.5 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
        {[
          { id: 'identity', label: 'Identity' },
          { id: 'agent', label: 'Agent' },
          { id: 'addresses', label: 'Addresses' },
          { id: 'officers', label: 'Board Members' },
          { id: 'compliance', label: 'Compliance' },
          { id: 'filings', label: 'Filings' },
          { id: 'deadlines', label: 'Deadlines' },
          { id: 'documents', label: 'Documents' },
          { id: 'audit', label: 'Audit Log' },
        ].map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* ===== 1. Organization Identity ===== */}
      <SectionCard
        id="identity"
        icon={HiOutlineBuildingOffice2}
        title="Organization Identity"
        action={isAdmin && editSection !== 'identity'
          ? <EditButton onClick={() => startEdit('identity')} />
          : editSection === 'identity'
          ? <SaveCancelButtons onSave={saveInfo} onCancel={cancelEdit} saving={saving} />
          : undefined}
      >
        {editSection === 'identity' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <EditableField label="Legal Organization Name" value={infoForm.legalName || ''} onChange={(v) => updateField('legalName', v)} />
            <EditableField label="Public Name / DBA" value={infoForm.publicName || ''} onChange={(v) => updateField('publicName', v)} />
            <EditableField label="EIN" value={infoForm.ein || ''} onChange={(v) => updateField('ein', v)} placeholder="XX-XXXXXXX" />
            <EditableField label="Texas Taxpayer Number" value={infoForm.texasTpNumber || ''} onChange={(v) => updateField('texasTpNumber', v)} />
            <EditableField label="Texas SOS File Number" value={infoForm.texasSosNumber || ''} onChange={(v) => updateField('texasSosNumber', v)} />
            <EditableField label="State of Formation" value={infoForm.incorporationState || ''} onChange={(v) => updateField('incorporationState', v)} />
            <EditableField label="Incorporation Date" value={infoForm.incorporationDate || ''} onChange={(v) => updateField('incorporationDate', v)} type="date" />
            <EditableField label="Nonprofit Type" value={infoForm.orgType || ''} onChange={(v) => updateField('orgType', v)} options={['501(c)(3)', '501(c)(4)', '501(c)(7)', 'Other']} />
            <EditableField label="IRS Determination Date" value={infoForm.irsDeterminationDate || ''} onChange={(v) => updateField('irsDeterminationDate', v)} type="date" />
            <EditableField label="IRS Status" value={infoForm.irsStatus || ''} onChange={(v) => updateField('irsStatus', v)} options={['Active', 'Revoked']} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Legal Organization Name" value={orgInfo.legalName} />
            <Field label="Public Name / DBA" value={orgInfo.publicName} />
            <div className="flex items-start justify-between">
              <Field label="EIN" value={orgInfo.ein} />
              {orgInfo.irsStatus && <Badge variant={complianceColor(orgInfo.irsStatus)}>{orgInfo.irsStatus}</Badge>}
            </div>
            <Field label="Texas Taxpayer Number" value={orgInfo.texasTpNumber} />
            <Field label="Texas SOS File Number" value={orgInfo.texasSosNumber} />
            <Field label="State of Formation" value={orgInfo.incorporationState} />
            <Field label="Incorporation Date" value={formatDate(orgInfo.incorporationDate)} />
            <Field label="Nonprofit Type" value={orgInfo.orgType} />
            <Field label="IRS Determination Date" value={formatDate(orgInfo.irsDeterminationDate)} />
          </div>
        )}
      </SectionCard>

      {/* ===== 2. Registered Agent ===== */}
      <SectionCard
        id="agent"
        icon={HiOutlineIdentification}
        title="Registered Agent"
        action={isAdmin && editSection !== 'agent'
          ? <EditButton onClick={() => startEdit('agent')} />
          : editSection === 'agent'
          ? <SaveCancelButtons onSave={saveInfo} onCancel={cancelEdit} saving={saving} />
          : undefined}
      >
        {editSection === 'agent' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <EditableField label="Agent Name" value={infoForm.registeredAgentName || ''} onChange={(v) => updateField('registeredAgentName', v)} />
            <EditableField label="Appointment Date" value={infoForm.registeredAgentAppointment || ''} onChange={(v) => updateField('registeredAgentAppointment', v)} type="date" />
            <EditableField label="Contact Email" value={infoForm.registeredAgentEmail || ''} onChange={(v) => updateField('registeredAgentEmail', v)} type="email" />
            <EditableField label="Contact Phone" value={infoForm.registeredAgentPhone || ''} onChange={(v) => updateField('registeredAgentPhone', v)} type="tel" />
            <div className="md:col-span-2">
              <EditableField label="Agent Address" value={infoForm.registeredAgentAddress || ''} onChange={(v) => updateField('registeredAgentAddress', v)} multiline />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Agent Name" value={orgInfo.registeredAgentName} />
            <Field label="Appointment Date" value={formatDate(orgInfo.registeredAgentAppointment)} />
            <Field label="Contact Email" value={orgInfo.registeredAgentEmail} />
            <Field label="Contact Phone" value={orgInfo.registeredAgentPhone} />
            <div className="md:col-span-2">
              <Field label="Agent Address" value={orgInfo.registeredAgentAddress} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* ===== 3. Organization Addresses ===== */}
      <SectionCard
        id="addresses"
        icon={HiOutlineMapPin}
        title="Organization Addresses"
        action={isAdmin && editSection !== 'addresses'
          ? <EditButton onClick={() => startEdit('addresses')} />
          : editSection === 'addresses'
          ? <SaveCancelButtons onSave={saveInfo} onCancel={cancelEdit} saving={saving} />
          : undefined}
      >
        {editSection === 'addresses' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 space-y-2">
              <EditableField label="Registered Office Address" value={infoForm.registeredAddress || ''} onChange={(v) => updateField('registeredAddress', v)} multiline />
            </div>
            <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 space-y-2">
              <EditableField label="Mailing Address" value={infoForm.mailingAddress || ''} onChange={(v) => updateField('mailingAddress', v)} multiline />
            </div>
            <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 space-y-2">
              <EditableField label="Primary Business Address" value={infoForm.businessAddress || ''} onChange={(v) => updateField('businessAddress', v)} multiline />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Registered Office', value: orgInfo.registeredAddress },
              { label: 'Mailing Address', value: orgInfo.mailingAddress },
              { label: 'Primary Business', value: orgInfo.businessAddress },
            ].map((addr) => (
              <div key={addr.label} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">{addr.label}</div>
                <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{addr.value || '\u2014'}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ===== 4. Board Members ===== */}
      <SectionCard
        id="officers"
        icon={HiOutlineUserGroup}
        title="Board Members"
        action={isAdmin ? (
          <button onClick={() => openOfficerModal()} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors">
            <HiOutlinePlusCircle className="w-3.5 h-3.5" /> Add Officer
          </button>
        ) : undefined}
      >
        {officers.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No officers added yet</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-700/50">
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Group</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Email</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Start Date</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">Portal Access</th>
                  {isAdmin && <th className="px-5 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {officers.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-5 py-2.5 font-medium text-gray-900 dark:text-gray-100">{o.name}</td>
                    <td className="px-5 py-2.5 text-gray-600 dark:text-gray-300">{o.role}</td>
                    <td className="px-5 py-2.5">
                      {o.group ? (
                        <Badge variant={o.group === 'BoD' ? 'blue' : 'yellow'}>{o.group}</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{o.email}</td>
                    <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">{formatDate(o.startDate)}</td>
                    <td className="px-5 py-2.5"><Badge variant={o.status === 'Active' ? 'green' : 'gray'}>{o.status}</Badge></td>
                    <td className="px-5 py-2.5 hidden lg:table-cell">
                      {o.portalRole ? (
                        <Badge variant={o.portalRole === 'admin' ? 'blue' : 'gray'}>{o.portalRole === 'admin' ? 'Admin' : 'Committee'}</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openOfficerModal(o)} className="p-1 text-gray-400 hover:text-primary-600 rounded"><HiOutlinePencilSquare className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteOfficer(o)} className="p-1 text-gray-400 hover:text-red-600 rounded"><HiOutlineTrash className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== 5. Compliance Status ===== */}
      <SectionCard
        id="compliance"
        icon={HiOutlineShieldCheck}
        title="Compliance Status Overview"
        action={isAdmin && editSection !== 'compliance'
          ? <EditButton onClick={() => startEdit('compliance')} />
          : editSection === 'compliance'
          ? <SaveCancelButtons onSave={saveInfo} onCancel={cancelEdit} saving={saving} />
          : undefined}
      >
        {editSection === 'compliance' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <EditableField label="IRS Status" value={infoForm.irsStatus || ''} onChange={(v) => updateField('irsStatus', v)} options={['Active', 'Revoked', 'Pending']} />
            <EditableField label="Texas Franchise Tax Status" value={infoForm.franchiseTaxStatus || ''} onChange={(v) => updateField('franchiseTaxStatus', v)} options={['Active', 'Good Standing', 'Warning', 'Forfeited']} />
            <EditableField label="Texas SOS Registration Status" value={infoForm.sosRegistrationStatus || ''} onChange={(v) => updateField('sosRegistrationStatus', v)} options={['Active', 'Good Standing', 'Warning', 'Forfeited']} />
            <EditableField label="Last Status Checked" value={infoForm.lastStatusChecked || ''} onChange={(v) => updateField('lastStatusChecked', v)} type="date" />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {complianceItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{item.label}</span>
                  {item.value ? (
                    <Badge variant={complianceColor(item.value)}>{item.value}</Badge>
                  ) : (
                    <Badge variant="gray">Not Set</Badge>
                  )}
                </div>
              ))}
            </div>
            {orgInfo.lastStatusChecked && (
              <p className="text-xs text-gray-400">Last verified: {formatDate(orgInfo.lastStatusChecked)}</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* ===== 6. Filing History ===== */}
      <SectionCard
        id="filings"
        icon={HiOutlineDocumentText}
        title="Filing History"
        action={isAdmin ? (
          <button onClick={() => openFilingModal()} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors">
            <HiOutlinePlusCircle className="w-3.5 h-3.5" /> Add Filing
          </button>
        ) : undefined}
      >
        {filings.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No filings recorded yet</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-700/50">
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Filing</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Year</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Filed Date</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Filed By</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Confirmation #</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {filings.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-5 py-2.5 font-medium text-gray-900 dark:text-gray-100">{f.filingType}</td>
                    <td className="px-5 py-2.5 text-gray-600 dark:text-gray-300">{f.filingYear}</td>
                    <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{formatDate(f.filedDate)}</td>
                    <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">{f.filedBy}</td>
                    <td className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell font-mono text-xs">{f.confirmationNumber}</td>
                    <td className="px-5 py-2.5"><Badge variant={complianceColor(f.status)}>{f.status}</Badge></td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {f.documentUrl && (
                          <a href={f.documentUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-primary-600 rounded">
                            <HiOutlineEye className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {isAdmin && (
                          <>
                            <button onClick={() => openFilingModal(f)} className="p-1 text-gray-400 hover:text-primary-600 rounded"><HiOutlinePencilSquare className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteFiling(f)} className="p-1 text-gray-400 hover:text-red-600 rounded"><HiOutlineTrash className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== 7. Compliance Deadlines ===== */}
      <SectionCard
        id="deadlines"
        icon={HiOutlineCalendarDays}
        title="Compliance Deadlines"
        action={isAdmin ? (
          editSection === 'deadlines'
            ? <SaveCancelButtons onSave={saveInfo} onCancel={cancelEdit} saving={saving} />
            : <div className="flex items-center gap-1">
                {deadlines.length > 0 && (
                  <button
                    onClick={() => sendDeadlineReminder()}
                    disabled={sendingReminder}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md transition-colors disabled:opacity-50"
                    title="Send reminder email to President, Secretary & Treasurer"
                  >
                    <HiOutlineEnvelope className="w-3.5 h-3.5" /> {sendingReminder ? 'Sending...' : 'Send Reminder'}
                  </button>
                )}
                <EditButton onClick={() => startEdit('deadlines')} />
              </div>
        ) : undefined}
      >
        {editSection === 'deadlines' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <EditableField label="Texas Franchise Tax Due" value={infoForm.franchiseTaxDueDate || ''} onChange={(v) => updateField('franchiseTaxDueDate', v)} type="date" />
            <EditableField label="Public Information Report Due" value={infoForm.publicInfoReportDueDate || ''} onChange={(v) => updateField('publicInfoReportDueDate', v)} type="date" />
            <EditableField label="IRS Form 990 Due" value={infoForm.irs990DueDate || ''} onChange={(v) => updateField('irs990DueDate', v)} type="date" />
          </div>
        ) : deadlines.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No deadlines configured. Click Edit to add due dates.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {deadlines.map((d) => {
              const days = daysUntilCST(d.date);
              const isOverdue = days !== null && days < 0;
              const isUrgent = days !== null && days >= 0 && days <= 30;
              return (
                <div key={d.label} className={`p-4 rounded-lg border ${
                  isOverdue ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' :
                  isUrgent ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10' :
                  'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{d.label}</span>
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <button
                          onClick={() => sendDeadlineReminder(d.key)}
                          disabled={sendingReminder}
                          className="p-0.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded disabled:opacity-50"
                          title={`Send reminder for ${d.label}`}
                        >
                          <HiOutlineEnvelope className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isOverdue ? <HiOutlineExclamationTriangle className="w-4 h-4 text-red-500" /> :
                       isUrgent ? <HiOutlineExclamationTriangle className="w-4 h-4 text-amber-500" /> :
                       <HiOutlineCheckCircle className="w-4 h-4 text-emerald-500" />}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {formatDate(d.date)}
                  </div>
                  <div className={`text-xs font-medium ${
                    isOverdue ? 'text-red-600 dark:text-red-400' :
                    isUrgent ? 'text-amber-600 dark:text-amber-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {days === null ? '' : isOverdue ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days remaining`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ===== 8. Document Repository ===== */}
      <SectionCard
        id="documents"
        icon={HiOutlineArchiveBox}
        title="Document Repository"
        action={isAdmin ? (
          <button onClick={() => openDocModal()} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors">
            <HiOutlinePlusCircle className="w-3.5 h-3.5" /> Add Document
          </button>
        ) : undefined}
      >
        {documents.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No documents uploaded yet</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-700/50">
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Document</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Version</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">Uploaded</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-2 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider w-32" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{d.name}</div>
                      {d.description && <div className="text-xs text-gray-400 line-clamp-1">{d.description}</div>}
                    </td>
                    <td className="px-5 py-2.5"><Badge variant="blue">{d.category}</Badge></td>
                    <td className="px-5 py-2.5 text-gray-500 hidden sm:table-cell">v{d.currentVersion}</td>
                    <td className="px-5 py-2.5 text-gray-500 text-xs hidden md:table-cell">{formatDate(d.updatedAt?.split('T')[0] || '')}</td>
                    <td className="px-5 py-2.5"><Badge variant={d.status === 'Active' ? 'green' : d.status === 'Expired' ? 'red' : 'gray'}>{d.status}</Badge></td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {d.currentFileUrl && (
                          <a href={d.currentFileUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Download">
                            <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button onClick={() => openVersions(d)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Version history">
                          <HiOutlineClock className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => openUpload(d.id)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Upload version">
                              <HiOutlineArrowUpTray className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openDocModal(d)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Edit">
                              <HiOutlinePencilSquare className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteDoc(d)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="Delete">
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== 9. Audit Log ===== */}
      <SectionCard id="audit" icon={HiOutlineClipboardDocumentList} title="Audit Log">
        {auditLog.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No audit entries yet</div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 dark:border-gray-700/50">
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Action</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Entity</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">Description</th>
                  <th className="px-5 py-2 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {auditLog.slice(0, 20).map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                    <td className="px-5 py-2">
                      <Badge variant={a.action === 'create' ? 'green' : a.action === 'delete' ? 'red' : 'blue'}>{a.action}</Badge>
                    </td>
                    <td className="px-5 py-2 text-gray-600 dark:text-gray-300 text-xs">{a.userEmail}</td>
                    <td className="px-5 py-2 text-gray-900 dark:text-gray-100 text-xs font-medium">{a.entityLabel || a.entityType}</td>
                    <td className="px-5 py-2 text-gray-500 text-xs hidden sm:table-cell">{a.description}</td>
                    <td className="px-5 py-2 text-gray-400 text-xs">{formatDate(a.timestamp?.split('T')[0] || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== MODALS ===== */}

      {/* Officer Modal */}
      <Modal open={officerModalOpen} onClose={() => setOfficerModalOpen(false)} title={editingOfficer ? 'Edit Officer' : 'Add Officer'}>
        <div className="space-y-3">
          <EditableField label="Name" value={officerForm.name} onChange={(v) => setOfficerForm({ ...officerForm, name: v })} placeholder="Full name" />
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Role" value={officerForm.role} onChange={(v) => setOfficerForm({ ...officerForm, role: v })} placeholder="e.g. President, Treasurer" />
            <EditableField label="Group" value={officerForm.group} onChange={(v) => setOfficerForm({ ...officerForm, group: v })} options={OFFICER_GROUPS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Email" value={officerForm.email} onChange={(v) => setOfficerForm({ ...officerForm, email: v })} type="email" />
            <EditableField label="Phone" value={officerForm.phone} onChange={(v) => setOfficerForm({ ...officerForm, phone: v })} type="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Start Date" value={officerForm.startDate} onChange={(v) => setOfficerForm({ ...officerForm, startDate: v })} type="date" />
            <EditableField label="End Date" value={officerForm.endDate} onChange={(v) => setOfficerForm({ ...officerForm, endDate: v })} type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Status" value={officerForm.status} onChange={(v) => setOfficerForm({ ...officerForm, status: v })} options={['Active', 'Former']} />
            <div>
              <label className="block text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Portal Access</label>
              <select value={officerForm.portalRole} onChange={(e) => setOfficerForm({ ...officerForm, portalRole: e.target.value })} className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-colors">
                <option value="">None</option>
                <option value="admin">Admin</option>
                <option value="committee">Committee</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Portal Access controls login to this admin dashboard. Leave empty for no access.</p>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setOfficerModalOpen(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
            <button onClick={saveOfficer} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : editingOfficer ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Filing Modal */}
      <Modal open={filingModalOpen} onClose={() => setFilingModalOpen(false)} title={editingFiling ? 'Edit Filing' : 'Add Filing'} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Filing Type" value={filingForm.filingType} onChange={(v) => setFilingForm({ ...filingForm, filingType: v })} options={FILING_TYPES} />
            <EditableField label="Filing Year" value={filingForm.filingYear} onChange={(v) => setFilingForm({ ...filingForm, filingYear: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Filed Date" value={filingForm.filedDate} onChange={(v) => setFilingForm({ ...filingForm, filedDate: v })} type="date" />
            <EditableField label="Filed By" value={filingForm.filedBy} onChange={(v) => setFilingForm({ ...filingForm, filedBy: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditableField label="Confirmation Number" value={filingForm.confirmationNumber} onChange={(v) => setFilingForm({ ...filingForm, confirmationNumber: v })} />
            <EditableField label="Status" value={filingForm.status} onChange={(v) => setFilingForm({ ...filingForm, status: v })} options={['Filed', 'Pending', 'Overdue']} />
          </div>
          <EditableField label="Notes" value={filingForm.notes} onChange={(v) => setFilingForm({ ...filingForm, notes: v })} multiline />
          <div>
            <label className="block text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Attach Document</label>
            <input
              type="file"
              onChange={(e) => setFilingUploadFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setFilingModalOpen(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
            <button onClick={saveFiling} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : editingFiling ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Document Modal */}
      <Modal open={docModalOpen} onClose={() => setDocModalOpen(false)} title={editingDoc ? 'Edit Document' : 'Add Document'}>
        <div className="space-y-3">
          <EditableField label="Document Name" value={docForm.name} onChange={(v) => setDocForm({ ...docForm, name: v })} placeholder="e.g., Articles of Incorporation" />
          <EditableField label="Category" value={docForm.category} onChange={(v) => setDocForm({ ...docForm, category: v })} options={DOC_CATEGORIES} />
          <EditableField label="Description" value={docForm.description} onChange={(v) => setDocForm({ ...docForm, description: v })} multiline />
          <EditableField label="Expiry Date" value={docForm.expiryDate} onChange={(v) => setDocForm({ ...docForm, expiryDate: v })} type="date" />
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setDocModalOpen(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
            <button onClick={saveDoc} disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : editingDoc ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Upload Modal */}
      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} title="Upload New Version">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Select File</label>
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-200"
            />
            {uploadFile && <p className="mt-1 text-xs text-gray-400">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>}
          </div>
          <EditableField label="Version Notes" value={uploadNotes} onChange={setUploadNotes} multiline placeholder="What changed?" />
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
            <button onClick={() => setUploadModalOpen(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
            <button onClick={handleUpload} disabled={uploading || !uploadFile} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} title="Version History" size="lg">
        {versionDoc && <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{versionDoc.name}</p>}
        {versionsLoading ? (
          <div className="text-center py-4 text-sm text-gray-400">Loading...</div>
        ) : versions.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400">No versions uploaded yet</div>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-600 dark:text-primary-400">v{v.version}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{v.fileName}</span>
                    {v.fileSize && <span className="text-[10px] text-gray-400">{formatFileSize(v.fileSize)}</span>}
                  </div>
                  {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                  <div className="text-[10px] text-gray-400 mt-0.5">{v.uploadedBy} &middot; {formatDate(v.uploadedAt?.split('T')[0] || '')}</div>
                </div>
                {v.fileUrl && (
                  <a href={v.fileUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    <HiOutlineArrowTopRightOnSquare className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
