import React from 'react';
import {
  ShieldCheck,
  Lock,
  Building2,
  MapPin,
  Mail,
  Phone,
  Award,
  X,
} from 'lucide-react';
import { DeveloperAdminProfile } from '../types';

export interface AdminEditorProps {
  profile: DeveloperAdminProfile;
  mode?: 'edit' | 'add' | 'readonly';
  onSave?: (profile: DeveloperAdminProfile) => void;
  onCancel?: () => void;
}

/**
 * Permanently Read-Only Administrator Profile Viewer.
 * All Edit, Update, Modify, and Delete actions are intentionally disabled
 * across Android, iOS, Windows, and Web platforms to protect administrator data.
 */
export const AdminEditor: React.FC<AdminEditorProps> = ({
  profile,
  onCancel,
}) => {
  const locationText = [
    profile.locality,
    profile.district ? `District ${profile.district}` : '',
    profile.unionTerritory,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      data-testid="protected-admin-readonly-panel"
      className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden"
    >
      <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
              <span>Administrator Profile — Read-Only</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-mono uppercase">
                Protected
              </span>
            </h2>
            <p className="text-[11px] text-slate-300">
              Administrator records are locked across Android, iOS, Windows, and Web.
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close administrator profile viewer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-6 space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Administrator Name</span>
            </span>
            <p className="font-extrabold text-slate-900 text-sm">{profile.name}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-600" />
              <span>Designation</span>
            </span>
            <p className="font-bold text-slate-900">{profile.designation}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Institution</span>
            </span>
            <p className="font-bold text-slate-900">{profile.institution}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>Location</span>
            </span>
            <p className="font-bold text-slate-900">{locationText || '—'}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              <span>Email</span>
            </span>
            <p className="font-mono font-bold text-slate-900 break-all">{profile.email || '—'}</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Contact</span>
            </span>
            <p className="font-mono font-bold text-slate-900">{profile.phone || '—'}</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            Editing, updating, modifying, and deleting Administrator details are permanently disabled for application security.
          </span>
        </div>
      </div>
    </div>
  );
};
