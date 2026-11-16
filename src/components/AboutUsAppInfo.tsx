import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  Edit2,
  Info,
  KeyRound,
  Lock,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unlock,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { DeveloperAdminProfile, SchoolProfile } from '../types';
import { Language } from '../utils/translations';
import { usePermissions } from '../hooks/usePermissions';
import { AdminEditor } from './AdminEditor';

interface AboutUsAppInfoProps {
  profiles: DeveloperAdminProfile[];
  activeProfile: DeveloperAdminProfile;
  school: SchoolProfile;
  language: Language;
  onSaveProfile: (updated: DeveloperAdminProfile) => void;
  onAddProfile: (created: DeveloperAdminProfile) => void;
  onSelectActiveProfile: (profileId: string) => void;
}

const DEV_PROFILE_PWD_KEY = 'school_master_v1_dev_profile_pwd_hash';
const LEGACY_WANI_PWD_KEY = 'sm_admin_pwd_hash_user-admin-wani';

async function hashAdminSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + '_schoolmaster_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const AboutUsAppInfo: React.FC<AboutUsAppInfoProps> = ({
  profiles,
  activeProfile,
  school,
  language,
  onSaveProfile,
  onAddProfile,
  onSelectActiveProfile,
}) => {
  const { currentUser, effectiveRole, addAuditLog } = usePermissions();
  const isAuthorizedRole = effectiveRole !== 'teacher';

  // Authentication / Unlock state for protected Admin Profile editing
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [hasPasswordConfigured, setHasPasswordConfigured] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'edit' | 'add' | null>(null);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Edit / Add mode state (delegated to <AdminEditor /> once password-unlocked)
  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const devHash = localStorage.getItem(DEV_PROFILE_PWD_KEY);
    const waniHash = localStorage.getItem(LEGACY_WANI_PWD_KEY);
    setHasPasswordConfigured(Boolean(devHash || waniHash));
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const openEditForm = () => {
    setMode('edit');
  };

  const openAddForm = () => {
    setMode('add');
  };

  const handleRequestProtectedAction = (action: 'edit' | 'add') => {
    if (!isAuthorizedRole) {
      showToast('Access Denied: Only authorized administrators can modify the Administrator Profile.');
      return;
    }

    if (isUnlocked) {
      if (action === 'edit') openEditForm();
      else openAddForm();
      return;
    }

    setPendingAction(action);
    setPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setAuthError(null);
    setShowAuthModal(true);
  };

  const handleVerifyOrCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const existingDevHash = localStorage.getItem(DEV_PROFILE_PWD_KEY);
    const existingWaniHash = localStorage.getItem(LEGACY_WANI_PWD_KEY);

    if (!existingDevHash && !existingWaniHash || isChangingPassword) {
      if (isChangingPassword && (existingDevHash || existingWaniHash)) {
        const currentHash = await hashAdminSecret(passwordInput);
        const currentMatches =
          (existingDevHash && currentHash === existingDevHash) ||
          (existingWaniHash && currentHash === existingWaniHash);
        if (!currentMatches) {
          setAuthError('Current administrator password is incorrect.');
          return;
        }
      }

      if (newPasswordInput.trim().length < 4) {
        setAuthError('Please enter an Admin Password of at least 4 characters.');
        return;
      }
      if (newPasswordInput !== confirmPasswordInput) {
        setAuthError('Passwords do not match.');
        return;
      }
      const hashed = await hashAdminSecret(newPasswordInput);
      localStorage.setItem(DEV_PROFILE_PWD_KEY, hashed);
      setHasPasswordConfigured(true);
      setIsUnlocked(true);
      setIsChangingPassword(false);
      setShowAuthModal(false);

      addAuditLog({
        actorId: currentUser.id,
        actorName: `${currentUser.name} (${effectiveRole})`,
        actionType: 'CREDENTIAL_RESET',
        description: isChangingPassword
          ? 'Updated Admin Profile protection password in About Us / App Information'
          : 'Configured Admin Profile protection password in About Us / App Information',
        status: 'SUCCESS',
      });

      if (pendingAction === 'edit') openEditForm();
      else if (pendingAction === 'add') openAddForm();
      else showToast('Administrator protection password saved.');
      setPendingAction(null);
      return;
    }

    const enteredHash = await hashAdminSecret(passwordInput);
    const matches =
      (existingDevHash && enteredHash === existingDevHash) ||
      (existingWaniHash && enteredHash === existingWaniHash);

    if (!matches) {
      setAuthError('Incorrect administrator password. Unauthorized edits are blocked.');
      return;
    }

    setIsUnlocked(true);
    setShowAuthModal(false);
    if (pendingAction === 'edit') openEditForm();
    if (pendingAction === 'add') openAddForm();
    setPendingAction(null);
  };

  const handleAdminEditorSave = (profile: DeveloperAdminProfile, isNew: boolean) => {
    if (isNew) {
      onAddProfile(profile);
      addAuditLog({
        actorId: currentUser.id,
        actorName: `${currentUser.name} (${effectiveRole})`,
        actionType: 'USER_CREATE',
        description: `Added new Administrator Profile: ${profile.name} (${profile.designation})`,
        newValue: `${profile.name} — ${profile.institution}`,
        status: 'SUCCESS',
      });
      setMode('view');
      showToast(`Added and activated Administrator Profile for ${profile.name}.`);
      return;
    }

    onSaveProfile(profile);
    addAuditLog({
      actorId: currentUser.id,
      actorName: `${currentUser.name} (${effectiveRole})`,
      actionType: 'USER_UPDATE',
      description: `Updated Administrator Profile: ${profile.name} (${profile.designation}) — ${profile.institution}, ${profile.district}`,
      oldValue: `${activeProfile.name} (${activeProfile.designation})`,
      newValue: `${profile.name} (${profile.designation})`,
      status: 'SUCCESS',
    });
    setMode('view');
    showToast('Administrator Profile saved to localStorage and updated across the application.');
  };

  const handleCancel = () => {
    setMode('view');
  };

  const locationSummary = [
    activeProfile.locality,
    activeProfile.district ? `District ${activeProfile.district}` : '',
    activeProfile.unionTerritory,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {toastMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-emerald-700 hover:text-emerald-950">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
            <Info className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">
              {language === 'ur' ? 'ایپ کی معلومات اور ایڈمن پروفائل' : 'About Us & App Information'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Official Administrator / App Developer Profile, Institutional Identity, and Security Controls.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAuthorizedRole ? (
            isUnlocked ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(true);
                    setPendingAction(null);
                    setPasswordInput('');
                    setNewPasswordInput('');
                    setConfirmPasswordInput('');
                    setAuthError(null);
                    setShowAuthModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Change Password</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsUnlocked(false);
                    if (mode !== 'view') handleCancel();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Admin Unlocked (Lock)</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Password Protected</span>
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Read-Only (Teacher Role)</span>
            </span>
          )}
        </div>
      </div>

      {/* Active Administrator / App Developer Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-black text-amber-300 shrink-0">
              {(activeProfile.name || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-[10px] font-extrabold uppercase tracking-wider text-amber-200">
                <ShieldCheck className="w-3 h-3" />
                <span>Verified Administrator Profile</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {activeProfile.name}
              </h2>
              <p className="text-xs sm:text-sm font-bold text-indigo-200">
                {activeProfile.designation}
              </p>
            </div>
          </div>

          {mode === 'view' && (
            <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
              <button
                type="button"
                disabled={!isAuthorizedRole}
                onClick={() => handleRequestProtectedAction('edit')}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-md ${
                  isAuthorizedRole
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 active:scale-95'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>

              <button
                type="button"
                disabled={!isAuthorizedRole}
                onClick={() => handleRequestProtectedAction('add')}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all border ${
                  isAuthorizedRole
                    ? 'bg-white/10 hover:bg-white/20 text-white border-white/25 active:scale-95'
                    : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add New Admin</span>
              </button>
            </div>
          )}
        </div>

        {/* Profile Display or Edit/Add Form */}
        <div className="p-6">
          {!isAuthorizedRole && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                You are currently signed in with the <strong>Teacher</strong> role. Only authorized School Administrators can add, edit, or update Administrator Profile details.
              </span>
            </div>
          )}

          {mode === 'view' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Name</span>
                  </span>
                  <p className="text-sm font-black text-slate-900">{activeProfile.name}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Designation</span>
                  </span>
                  <p className="text-sm font-black text-indigo-900">{activeProfile.designation}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Institution</span>
                  </span>
                  <p className="text-sm font-black text-slate-900">{activeProfile.institution}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-600" />
                    <span>District</span>
                  </span>
                  <p className="text-sm font-bold text-slate-900">{activeProfile.district}</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Union Territory &amp; Location</span>
                  </span>
                  <p className="text-sm font-bold text-slate-900">
                    {locationSummary || activeProfile.unionTerritory}
                  </p>
                </div>
              </div>

              {/* Saved Administrator Profiles Directory */}
              {profiles.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Registered Administrator / Developer Profiles ({profiles.length})
                    </h3>
                    {isAuthorizedRole && (
                      <button
                        type="button"
                        onClick={() => handleRequestProtectedAction('add')}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Administrator</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profiles.map((prof) => {
                      const isActive = prof.id === activeProfile.id;
                      return (
                        <div
                          key={prof.id}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isActive
                              ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-slate-900 truncate">
                                {prof.name}
                              </span>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-semibold text-indigo-700 truncate">
                              {prof.designation}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {prof.institution} • {prof.district}, {prof.unionTerritory}
                            </p>
                          </div>

                          {!isActive && isAuthorizedRole && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectActiveProfile(prof.id);
                                showToast(`Active Administrator Profile switched to ${prof.name}.`);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-xs font-bold text-slate-700 transition-colors shrink-0"
                            >
                              Set Active
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <AdminEditor
              mode={mode}
              activeProfile={activeProfile}
              school={school}
              isAuthorized={isAuthorizedRole}
              isUnlocked={isUnlocked}
              onSave={handleAdminEditorSave}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>

      {/* App Information Summary Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <Smartphone className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-black text-slate-900">Application Information</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Application Name</span>
            <strong className="text-slate-900 font-extrabold">SchoolMaster (HPC &amp; JKHRMS)</strong>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Version &amp; Platform</span>
            <strong className="text-slate-900 font-mono font-extrabold">v1.0.0 • Android / PWA</strong>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Active School U-DISE</span>
            <strong className="text-indigo-700 font-mono font-extrabold">{school.code}</strong>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Framework Compliance</span>
            <strong className="text-emerald-700 font-extrabold">NEP 2020 &amp; RTE Guidelines</strong>
          </div>
        </div>
      </div>

      {/* Administrator Password Verification Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold">
                  {isChangingPassword
                    ? 'Change Admin Profile Password'
                    : hasPasswordConfigured
                      ? 'Administrator Authentication'
                      : 'Set Admin Profile Password'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setIsChangingPassword(false);
                  setPendingAction(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyOrCreatePassword} className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {isChangingPassword
                  ? 'Verify your current Administrator password and enter a new password for Admin Editor access.'
                  : hasPasswordConfigured
                    ? 'Enter your Administrator password to unlock the Admin Editor and modify Developer / Institutional details.'
                    : 'Create an Administrator protection password so only authorized administrators can modify Developer / Admin Profile details.'}
              </p>

              {(hasPasswordConfigured || isChangingPassword) && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isChangingPassword ? 'Current Administrator Password *' : 'Administrator Password *'}
                  </label>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {(!hasPasswordConfigured || isChangingPassword) && (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {isChangingPassword ? 'New Admin Password *' : 'Create Admin Password *'}
                    </label>
                    <input
                      type="password"
                      required
                      autoFocus={!isChangingPassword}
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Minimum 4 characters"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Confirm Admin Password *</label>
                    <input
                      type="password"
                      required
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              {authError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {authError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(false);
                    setIsChangingPassword(false);
                    setPendingAction(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold shadow-sm"
                >
                  {isChangingPassword
                    ? 'Update Password'
                    : hasPasswordConfigured
                      ? 'Unlock & Proceed'
                      : 'Set Password & Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
