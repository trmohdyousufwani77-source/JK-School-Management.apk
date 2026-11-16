import React, { useState } from 'react';
import {
  BookOpen,
  Edit2,
  Check,
  Award,
  Layers,
  Settings,
  UserCheck,
  TrendingUp,
  Sliders,
  ShieldCheck,
  Save,
  HelpCircle,
} from 'lucide-react';
import { SchoolProfile, TeacherProfile, SubjectConfig } from '../types';
import { Language, translations } from '../utils/translations';
import { sampleSubjectConfigs } from '../utils/sampleData';

interface SubjectManagementProps {
  school: SchoolProfile;
  teachers: TeacherProfile[];
  language: Language;
  isAdmin: boolean;
  onUpdateSubjectConfig?: (updatedSubjects: SubjectConfig[]) => void;
}

export const SubjectManagement: React.FC<SubjectManagementProps> = ({
  school,
  teachers,
  language,
  isAdmin,
  onUpdateSubjectConfig,
}) => {
  const t = translations[language];

  // Subject configs state with default 6 mandatory subjects
  const [subjects, setSubjects] = useState<SubjectConfig[]>(sampleSubjectConfigs);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SubjectConfig | null>(null);
  const [saveNotice, setSaveNotice] = useState<string>('');

  // Assessment weightages configuration
  const [weightages, setWeightages] = useState<{ [key: string]: { written: number; internal: number; practical: number } }>({
    ENG: { written: 80, internal: 20, practical: 0 },
    URD: { written: 80, internal: 20, practical: 0 },
    MTH: { written: 80, internal: 10, practical: 10 },
    KAS: { written: 80, internal: 20, practical: 0 },
    SST: { written: 75, internal: 15, practical: 10 },
    SCI: { written: 70, internal: 10, practical: 20 },
  });

  const handleStartEdit = (sub: SubjectConfig) => {
    setEditingCode(sub.code);
    setEditForm({ ...sub });
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    const updated = subjects.map((s) => (s.code === editForm.code ? editForm : s));
    setSubjects(updated);
    if (onUpdateSubjectConfig) {
      onUpdateSubjectConfig(updated);
    }
    setEditingCode(null);
    setEditForm(null);
    setSaveNotice(`Configuration for ${editForm.name} updated successfully!`);
    setTimeout(() => setSaveNotice(''), 3500);
  };

  const handleWeightageChange = (code: string, field: 'written' | 'internal' | 'practical', value: number) => {
    setWeightages((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value,
      },
    }));
  };

  // Find assigned teachers for a subject
  const getAssignedTeacher = (subName: string) => {
    const matched = teachers.filter((tch) =>
      tch.assignedClasses.some((ac) => ac.subject.toLowerCase() === subName.toLowerCase())
    );
    return matched.length > 0 ? matched.map((m) => m.name).join(', ') : 'Mohd Yousuf Wani (Admin In-Charge)';
  };

  return (
    <div className="space-y-6">
      {/* Banner Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <span>Subject Management & Assessment Criteria</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure the 6 mandatory curriculum subjects, maximum marks, passing thresholds, assessment weightages, and grading scales.
          </p>
        </div>

        {saveNotice && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold animate-in fade-in flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{saveNotice}</span>
          </div>
        )}
      </div>

      {/* Six Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {subjects.map((sub, idx) => {
          const isEditing = editingCode === sub.code;
          const assigned = getAssignedTeacher(sub.name);
          const weightage = weightages[sub.code] || { written: 80, internal: 20, practical: 0 };

          return (
            <div
              key={sub.code}
              className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                isEditing ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-md' : 'border-slate-200 shadow-sm hover:border-indigo-300'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 font-black text-sm flex items-center justify-center font-mono">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">{sub.name}</h3>
                      <p className="font-urdu text-xs text-slate-500 mt-0.5">{sub.nameUrdu}</p>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-700">
                    {sub.code}
                  </span>
                </div>

                {/* Subject Details & Edit Mode */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3 text-xs">
                  {isEditing && editForm ? (
                    <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Maximum Marks:
                        </label>
                        <input
                          type="number"
                          value={editForm.maxMarks}
                          onChange={(e) => setEditForm({ ...editForm, maxMarks: parseInt(e.target.value, 10) || 100 })}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Passing Minimum Marks:
                        </label>
                        <input
                          type="number"
                          value={editForm.passingMarks}
                          onChange={(e) => setEditForm({ ...editForm, passingMarks: parseInt(e.target.value, 10) || 33 })}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id={`comp-${sub.code}`}
                          checked={editForm.isCompulsory}
                          onChange={(e) => setEditForm({ ...editForm, isCompulsory: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor={`comp-${sub.code}`} className="font-bold text-slate-700 text-xs">
                          Compulsory Core Subject
                        </label>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1 hover:bg-indigo-700"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </button>
                        <button
                          onClick={() => { setEditingCode(null); setEditForm(null); }}
                          className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Maximum Marks:</span>
                        <strong className="text-slate-900 font-mono text-sm">{sub.maxMarks}</strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Passing Threshold:</span>
                        <strong className="text-slate-900 font-mono text-sm">{sub.passingMarks} (33%)</strong>
                      </div>

                      <div className="flex items-center justify-between text-slate-600">
                        <span>Assigned Faculty:</span>
                        <strong className="text-indigo-950 font-semibold">{assigned}</strong>
                      </div>
                    </>
                  )}

                  {/* Weightage Breakdown Sliders */}
                  <div className="pt-2 border-t border-slate-100">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Assessment Weightage (%):
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">Written</span>
                        <span className="font-bold text-slate-900 font-mono">{weightage.written}%</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">Internal</span>
                        <span className="font-bold text-slate-900 font-mono">{weightage.internal}%</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[10px] text-slate-500 block">Practical</span>
                        <span className="font-bold text-slate-900 font-mono">{weightage.practical}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action Footer */}
              {!isEditing && isAdmin && (
                <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">NEP 2020 Compliant</span>
                  <button
                    onClick={() => handleStartEdit(sub)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-xs font-bold transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Configure</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grading Scale Reference & Configuration Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-900">
              Configurable Academic Grading System
            </h2>
          </div>
          <span className="text-xs text-slate-500">Auto-Applied to Marks & Progress Cards</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs text-center">
          {school.gradingScale.map((gb) => (
            <div key={gb.grade} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-lg font-black text-indigo-700 block font-mono">{gb.grade}</span>
              <span className="font-mono text-[11px] text-slate-500 block">{gb.minPercentage}% - {gb.maxPercentage}%</span>
              <span className="text-[10px] text-slate-700 font-medium block truncate" title={gb.remark}>
                {gb.remark}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
