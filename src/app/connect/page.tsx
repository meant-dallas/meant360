import { Metadata } from 'next';
import { getPublicSettings } from '@/services/settings.service';
import { SOCIAL_PLATFORMS } from '@/lib/social-platforms';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stay Connected | MEANT 360',
  description: 'Follow MEANT on social media',
};

export default async function ConnectPage() {
  const { socialLinks } = await getPublicSettings();
  const activeSocial = SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center px-6 py-16">
      <img src="/logo.png" alt="MEANT" className="w-16 h-16 rounded-2xl object-cover mb-4" />
      <h1 className="text-2xl font-bold text-white mb-1 text-center">Stay Connected</h1>
      <p className="text-sm text-slate-400 mb-8 text-center">Follow MEANT everywhere, all in one place.</p>

      {activeSocial.length === 0 ? (
        <p className="text-sm text-slate-500">No social links are configured yet.</p>
      ) : (
        <div className="w-full max-w-sm space-y-3">
          {activeSocial.map((platform) => {
            const Icon = platform.icon;
            const url = socialLinks[platform.key];
            return (
              <a
                key={platform.key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl px-4 py-3.5 transition-colors"
              >
                <span className={`w-10 h-10 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </span>
                <span className="text-sm font-medium text-white flex-1">{platform.label}</span>
                <span className="text-slate-500 text-sm">&rarr;</span>
              </a>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-600 mt-12 text-center">
        &copy; 2026 MEANT (Malayalee Engineers&apos; Association of North Texas)
      </p>
    </div>
  );
}
