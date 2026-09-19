import type { SocialLinks } from '@/types';
import { FaInstagram, FaFacebook, FaLinkedin, FaYoutube } from 'react-icons/fa6';

export const SOCIAL_PLATFORMS: { key: keyof SocialLinks; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: FaInstagram, color: 'from-pink-500 to-purple-600' },
  { key: 'facebook', label: 'Facebook', icon: FaFacebook, color: 'from-blue-600 to-blue-700' },
  { key: 'linkedin', label: 'LinkedIn', icon: FaLinkedin, color: 'from-blue-500 to-blue-600' },
  { key: 'youtube', label: 'YouTube', icon: FaYoutube, color: 'from-red-500 to-red-600' },
];
