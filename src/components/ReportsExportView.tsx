import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Filter, 
  Building2, 
  UserCheck, 
  Eye, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Slash,
  Printer,
  Sparkles,
  FileText,
  User
} from 'lucide-react';
import { AttendanceRecord, Member } from '../types';
import { DEPARTMENTS } from '../utils/storage';
import { 
  exportMonthlyAttendanceExcel, 
  exportPersonAttendanceExcel, 
  getStatusCode, 
  getStatusLabel 
} from '../utils/excelExport';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';

interface ReportsExportViewProps {
  members: Member[];
  records: AttendanceRecord[];
  onSelectPerson: (member: Member) => void;
}

export const ReportsExportView: React.FC<ReportsExportViewProps> = ({
  members,
  records,
  onSelectPerson
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 1-12 (Sept 2026)
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedIndividualId, setSelectedIndividualId] = useState<string>('');

  const activeMembers = useMemo(() => members.filter(m => m.active), [members]);

  const filteredMembers = useMemo(() => {
    return selectedDept === 'All'
      ? activeMembers
      : activeMembers.filter(m => m.department === selectedDept);
  }, [activeMembers, selectedDept]);

  const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'long' });
  const totalDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Map of memberId -> date -> AttendanceRecord
  const recordMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>();
    records.filter(r => r.date.startsWith(monthPrefix)).forEach(r => {
      if (!map.has(r.memberId)) {
        map.set(r.memberId, new Map());
      }
      map.get(r.memberId)!.set(r.date, r);
    });
    return map;
  }, [records, monthPrefix]);

  // Overall Month Statistics
  const monthSummary = useMemo(() => {
    let totalP = 0;
    let totalL = 0;
    let totalHD = 0;
    let totalA = 0;
    let totalE = 0;
    let totalEntries = 0;

    filteredMembers.forEach(mem => {
      const memRecs = recordMap.get(mem.id);
      if (memRecs) {
        memRecs.forEach(r => {
          totalEntries++;
          if (r.status === 'present') totalP++;
          else if (r.status === 'late') totalL++;
          else if (r.status === 'half_day') totalHD++;
          else if (r.status === 'absent') totalA++;
          else if (r.status === 'excused') totalE++;
        });
      }
    });

    const effective = totalP + totalL + (totalHD * 0.5);
    const avgRate = totalEntries > 0 ? Math.round((effective / totalEntries) * 100) : 0;

    return { totalP, totalL, totalHD, totalA, totalE, totalEntries, avgRate };
  }, [filteredMembers, recordMap]);

  const handleDownloadMonthlyExcel = () => {
    exportMonthlyAttendanceExcel(selectedYear, selectedMonth, members, records, selectedDept);
    try {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    } catch {}
  };

  const handleDownloadIndividualExcel = () => {
    if (!selectedIndividualId) return;
    const mem = members.find(m => m.id === selectedIndividualId);
    if (mem) {
      exportPersonAttendanceExcel(mem, records);
    }
  };

  const handlePrintView = () => {
    window.print();
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-lg bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Excel Spreadsheet Reports Engine
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Monthly Attendance Register & Export
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Download formatted multi-sheet Excel workbooks (.xlsx) with grid matrix, daily punch logs, and department analytics.
          </p>
        </div>

        {/* Primary Download Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="download-monthly-xlsx-btn"
            onClick={handleDownloadMonthlyExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Download Monthly Excel (.xlsx)</span>
          </button>

          <button
            id="print-report-btn"
            onClick={handlePrintView}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
          >
            <Printer className="w-4 h-4" />
            <span>Print View</span>
          </button>
        </div>
      </div>

      {/* Filter and Selection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Month Picker */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
          <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Select Month</span>
          </label>
          <select
            id="report-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {[
              { num: 1, name: 'January' },
              { num: 2, name: 'February' },
              { num: 3, name: 'March' },
              { num: 4, name: 'April' },
              { num: 5, name: 'May' },
              { num: 6, name: 'June' },
              { num: 7, name: 'July' },
              { num: 8, name: 'August' },
              { num: 9, name: 'September' },
              { num: 10, name: 'October' },
              { num: 11, name: 'November' },
              { num: 12, name: 'December' },
            ].map(m => (
              <option key={m.num} value={m.num}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Year Picker */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
          <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Select Year</span>
          </label>
          <select
            id="report-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Department Filter */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
          <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Department</span>
          </label>
          <select
            id="report-dept-select"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="All">All Departments</option>
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Individual Person Excel Exporter Shortcut */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
          <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-indigo-600" />
            <span>Single Member Dossier</span>
          </label>
          <div className="flex items-center gap-1.5">
            <select
              id="report-individual-select"
              value={selectedIndividualId}
              onChange={(e) => setSelectedIndividualId(e.target.value)}
              className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer truncate"
            >
              <option value="">Select Person...</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.employeeId})</option>
              ))}
            </select>
            <button
              id="download-single-person-btn"
              onClick={handleDownloadIndividualExcel}
              disabled={!selectedIndividualId}
              title="Download Person's Excel"
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* Monthly Statistics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Avg Attendance</span>
          <p className="text-xl font-extrabold text-indigo-600 mt-0.5">{monthSummary.avgRate}%</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Present</span>
          <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{monthSummary.totalP}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Late</span>
          <p className="text-xl font-extrabold text-amber-600 mt-0.5">{monthSummary.totalL}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Half Days</span>
          <p className="text-xl font-extrabold text-purple-600 mt-0.5">{monthSummary.totalHD}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Absent</span>
          <p className="text-xl font-extrabold text-rose-600 mt-0.5">{monthSummary.totalA}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Leaves / Excused</span>
          <p className="text-xl font-extrabold text-blue-600 mt-0.5">{monthSummary.totalE}</p>
        </div>
      </div>

      {/* Interactive Live Spreadsheet Matrix Preview */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Spreadsheet Matrix Preview: {monthName} {selectedYear}</span>
              <span className="text-xs font-normal text-slate-500">({filteredMembers.length} Staff Rows × {totalDaysInMonth} Day Columns)</span>
            </h3>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-600">Spreadsheet Cell Codes:</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              P = Present
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              L = Late
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              HD = Half
            </span>
            <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              A = Absent
            </span>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-center border-collapse text-xs font-mono">
            <thead className="sticky top-0 z-20 bg-slate-100/95 backdrop-blur-xs border-b border-slate-300 shadow-2xs font-sans">
              <tr className="text-[11px] font-bold text-slate-700">
                <th className="py-3 px-3 text-left sticky left-0 z-30 bg-slate-100 min-w-[200px] border-r border-slate-300">
                  Staff Member
                </th>
                <th className="py-3 px-2 text-left min-w-[120px] border-r border-slate-200">
                  Dept
                </th>

                {/* Day 1..N Header */}
                {Array.from({ length: totalDaysInMonth }, (_, i) => i + 1).map(day => {
                  const dayDate = new Date(selectedYear, selectedMonth - 1, day);
                  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                  const weekdayNarrow = dayDate.toLocaleDateString('default', { weekday: 'narrow' });
                  return (
                    <th
                      key={day}
                      className={`py-2 px-1.5 min-w-[32px] border-r border-slate-200 text-[10px] ${
                        isWeekend ? 'bg-slate-200/70 text-slate-400 font-normal' : 'text-slate-800'
                      }`}
                    >
                      <div>{day}</div>
                      <div className="text-[9px] text-slate-400 font-semibold">{weekdayNarrow}</div>
                    </th>
                  );
                })}

                {/* Totals Header */}
                <th className="py-3 px-2 min-w-[45px] bg-emerald-50 text-emerald-900 border-l border-r border-emerald-200">P</th>
                <th className="py-3 px-2 min-w-[45px] bg-amber-50 text-amber-900 border-r border-amber-200">L</th>
                <th className="py-3 px-2 min-w-[45px] bg-purple-50 text-purple-900 border-r border-purple-200">HD</th>
                <th className="py-3 px-2 min-w-[45px] bg-rose-50 text-rose-900 border-r border-rose-200">A</th>
                <th className="py-3 px-2 min-w-[45px] bg-blue-50 text-blue-900 border-r border-blue-200">E</th>
                <th className="py-3 px-3 min-w-[65px] bg-indigo-50 text-indigo-900 font-bold">Rate %</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredMembers.map((member) => {
                const memRecords = recordMap.get(member.id) || new Map();
                let p = 0, l = 0, hd = 0, a = 0, e = 0, totalMarked = 0;

                return (
                  <tr key={member.id} className="hover:bg-indigo-50/30 transition-colors">
                    
                    {/* Member Column (Sticky left) */}
                    <td className="py-2.5 px-3 text-left sticky left-0 z-10 bg-white border-r border-slate-300 font-sans">
                      <div className="flex items-center gap-2">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className="w-6 h-6 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-tr ${member.avatarColor} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span 
                            onClick={() => onSelectPerson(member)}
                            className="font-bold text-slate-900 text-xs hover:text-indigo-600 cursor-pointer truncate block"
                          >
                            {member.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{member.employeeId}</span>
                        </div>
                      </div>
                    </td>

                    {/* Dept */}
                    <td className="py-2.5 px-2 text-left font-sans text-[11px] text-slate-600 truncate border-r border-slate-200 max-w-[120px]">
                      {member.department}
                    </td>

                    {/* Day 1..N Cells */}
                    {Array.from({ length: totalDaysInMonth }, (_, i) => i + 1).map(day => {
                      const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                      const rec = memRecords.get(dateStr);
                      const dayDate = new Date(selectedYear, selectedMonth - 1, day);
                      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

                      if (rec) {
                        totalMarked++;
                        if (rec.status === 'present') p++;
                        else if (rec.status === 'late') l++;
                        else if (rec.status === 'half_day') hd++;
                        else if (rec.status === 'absent') a++;
                        else if (rec.status === 'excused') e++;
                      }

                      let cellBg = '';
                      let cellText = '-';

                      if (rec) {
                        if (rec.status === 'present') { cellBg = 'bg-emerald-100/70 text-emerald-900 font-bold'; cellText = 'P'; }
                        else if (rec.status === 'late') { cellBg = 'bg-amber-100 text-amber-900 font-bold'; cellText = 'L'; }
                        else if (rec.status === 'half_day') { cellBg = 'bg-purple-100 text-purple-900 font-bold'; cellText = 'HD'; }
                        else if (rec.status === 'absent') { cellBg = 'bg-rose-100 text-rose-900 font-bold'; cellText = 'A'; }
                        else if (rec.status === 'excused') { cellBg = 'bg-blue-100 text-blue-900 font-bold'; cellText = 'E'; }
                      } else if (isWeekend) {
                        cellBg = 'bg-slate-100/60 text-slate-300 font-sans';
                        cellText = '·';
                      }

                      return (
                        <td
                          key={day}
                          title={`${member.name} - ${dateStr}: ${rec ? getStatusLabel(rec.status) : (isWeekend ? 'Weekend' : 'Unmarked')}`}
                          className={`py-2 px-1 border-r border-slate-100 text-[10px] ${cellBg}`}
                        >
                          {cellText}
                        </td>
                      );
                    })}

                    {/* Summary Totals Calculation */}
                    {(() => {
                      const effective = p + l + (hd * 0.5);
                      const rate = totalMarked > 0 ? Math.round((effective / totalMarked) * 100) : 0;
                      return (
                        <>
                          <td className="py-2 px-1 font-bold text-emerald-700 bg-emerald-50/50 border-l border-r border-emerald-100">{p}</td>
                          <td className="py-2 px-1 font-bold text-amber-700 bg-amber-50/50 border-r border-amber-100">{l}</td>
                          <td className="py-2 px-1 font-bold text-purple-700 bg-purple-50/50 border-r border-purple-100">{hd}</td>
                          <td className="py-2 px-1 font-bold text-rose-700 bg-rose-50/50 border-r border-rose-100">{a}</td>
                          <td className="py-2 px-1 font-bold text-blue-700 bg-blue-50/50 border-r border-blue-100">{e}</td>
                          <td className="py-2 px-2 font-bold font-sans text-indigo-700 bg-indigo-50/60 text-[11px]">{rate}%</td>
                        </>
                      );
                    })()}

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>
            💡 Click <strong>"Download Monthly Excel"</strong> above to save this full register as an Excel Spreadsheet file (.xlsx).
          </span>
          <button
            onClick={handleDownloadMonthlyExcel}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Generate & Download .XLSX</span>
          </button>
        </div>

      </div>

    </div>
  );
};
