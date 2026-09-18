import * as XLSX from 'xlsx';
import { AttendanceRecord, AttendanceStatus, Member } from '../types';

export function getStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'present': return 'Present';
    case 'absent': return 'Absent';
    case 'late': return 'Late';
    case 'half_day': return 'Half Day';
    case 'excused': return 'Excused/Leave';
    default: return 'Unmarked';
  }
}

export function getStatusCode(status: AttendanceStatus | undefined): string {
  if (!status) return '-';
  switch (status) {
    case 'present': return 'P';
    case 'absent': return 'A';
    case 'late': return 'L';
    case 'half_day': return 'HD';
    case 'excused': return 'E';
    default: return '-';
  }
}

// Calculate hours between two HH:MM strings
export function calculateWorkingHours(inTime?: string, outTime?: string): string {
  if (!inTime || !outTime) return '-';
  const [inH, inM] = inTime.split(':').map(Number);
  const [outH, outM] = outTime.split(':').map(Number);
  if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '-';
  
  const diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (diffMinutes <= 0) return '-';
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Generates and downloads a multi-tab Excel Workbook (.xlsx) containing:
 * 1. "Monthly Matrix" (Grid: Employees x Days 1..31 + Totals & %)
 * 2. "Daily Detailed Logs" (Every single punch log with timestamps & notes)
 * 3. "Department Summary" (Analytics per department)
 */
export function exportMonthlyAttendanceExcel(
  year: number,
  month: number, // 1 - 12
  members: Member[],
  records: AttendanceRecord[],
  selectedDepartment: string = 'All'
) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const filteredMembers = selectedDepartment === 'All'
    ? members
    : members.filter(m => m.department === selectedDepartment);

  // Map of memberId -> date -> AttendanceRecord
  const recordMap = new Map<string, Map<string, AttendanceRecord>>();
  records.forEach(r => {
    if (!recordMap.has(r.memberId)) {
      recordMap.set(r.memberId, new Map());
    }
    recordMap.get(r.memberId)!.set(r.date, r);
  });

  // 1. Build Monthly Matrix Sheet Data
  const matrixHeaders: string[] = [
    'Emp ID',
    'Name',
    'Department',
    'Role',
    'Shift'
  ];

  // Add Day 1..N columns
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayDate = new Date(year, month - 1, d);
    const dayOfWeek = dayDate.toLocaleDateString('default', { weekday: 'narrow' });
    matrixHeaders.push(`${d} (${dayOfWeek})`);
  }

  // Summary headers
  matrixHeaders.push('Total Days Marked', 'Present (P)', 'Late (L)', 'Half Day (HD)', 'Absent (A)', 'Excused (E)', 'Attendance %');

  const matrixRows: (string | number)[][] = [
    [`MONTHLY ATTENDANCE REGISTER - ${monthName.toUpperCase()} ${year}`],
    [`Generated on: ${new Date().toLocaleString()} | Department Filter: ${selectedDepartment}`],
    [], // Blank separator row
    matrixHeaders
  ];

  filteredMembers.forEach(member => {
    const memRecords = recordMap.get(member.id) || new Map();
    let pCount = 0;
    let lCount = 0;
    let hdCount = 0;
    let aCount = 0;
    let eCount = 0;
    let totalMarked = 0;

    const row: (string | number)[] = [
      member.employeeId,
      member.name,
      member.department,
      member.role,
      member.shift.toUpperCase()
    ];

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const rec = memRecords.get(dateStr);
      if (rec) {
        row.push(getStatusCode(rec.status));
        totalMarked++;
        if (rec.status === 'present') pCount++;
        else if (rec.status === 'late') lCount++;
        else if (rec.status === 'half_day') hdCount++;
        else if (rec.status === 'absent') aCount++;
        else if (rec.status === 'excused') eCount++;
      } else {
        const dayDate = new Date(year, month - 1, d);
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        row.push(isWeekend ? 'OFF' : '-');
      }
    }

    const effectiveScore = pCount + lCount + (hdCount * 0.5);
    const ratePercent = totalMarked > 0 ? Math.round((effectiveScore / totalMarked) * 100) : 0;

    row.push(totalMarked, pCount, lCount, hdCount, aCount, eCount, `${ratePercent}%`);
    matrixRows.push(row);
  });

  // Legend at bottom
  matrixRows.push([]);
  matrixRows.push(['LEGEND:', 'P = Present', 'L = Late', 'HD = Half Day (0.5x)', 'A = Absent', 'E = Excused/Leave', 'OFF = Weekend', '- = Unmarked']);

  // 2. Build Detailed Logs Sheet Data
  const detailHeaders = [
    'Date',
    'Day',
    'Emp ID',
    'Name',
    'Department',
    'Status',
    'Check-In Time',
    'Check-Out Time',
    'Total Hours',
    'Notes / Remarks'
  ];

  const detailRows: (string | number)[][] = [
    detailHeaders
  ];

  // Get all records in this month for filtered members sorted by date ascending
  const monthRecords = records.filter(r => {
    if (!r.date.startsWith(monthPrefix)) return false;
    const m = filteredMembers.find(mem => mem.id === r.memberId);
    return Boolean(m);
  }).sort((a, b) => a.date.localeCompare(b.date));

  monthRecords.forEach(r => {
    const mem = members.find(m => m.id === r.memberId);
    if (!mem) return;
    const recordDate = new Date(`${r.date}T00:00:00`);
    const dayName = recordDate.toLocaleDateString('default', { weekday: 'short' });
    const hours = calculateWorkingHours(r.checkInTime, r.checkOutTime);

    detailRows.push([
      r.date,
      dayName,
      mem.employeeId,
      mem.name,
      mem.department,
      getStatusLabel(r.status),
      r.checkInTime || '-',
      r.checkOutTime || '-',
      hours,
      r.notes || '-'
    ]);
  });

  // 3. Department Summary
  const deptSummaryHeaders = ['Department', 'Total Members', 'Present Records', 'Late Records', 'Half Day', 'Absent Records', 'Excused', 'Avg Attendance Rate %'];
  const deptSummaryRows: (string | number)[][] = [deptSummaryHeaders];

  const departments = Array.from(new Set(filteredMembers.map(m => m.department)));
  departments.forEach(dept => {
    const deptMems = filteredMembers.filter(m => m.department === dept);
    const deptMemIds = new Set(deptMems.map(m => m.id));
    const deptRecs = monthRecords.filter(r => deptMemIds.has(r.memberId));

    let p = 0, l = 0, hd = 0, a = 0, e = 0;
    deptRecs.forEach(r => {
      if (r.status === 'present') p++;
      else if (r.status === 'late') l++;
      else if (r.status === 'half_day') hd++;
      else if (r.status === 'absent') a++;
      else if (r.status === 'excused') e++;
    });

    const total = deptRecs.length;
    const rate = total > 0 ? Math.round(((p + l + hd * 0.5) / total) * 100) : 0;
    deptSummaryRows.push([dept, deptMems.length, p, l, hd, a, e, `${rate}%`]);
  });

  // Create Workbook
  const workbook = XLSX.utils.book_new();

  // Create sheets
  const matrixWorksheet = XLSX.utils.aoa_to_sheet(matrixRows);
  const detailWorksheet = XLSX.utils.aoa_to_sheet(detailRows);
  const deptWorksheet = XLSX.utils.aoa_to_sheet(deptSummaryRows);

  // Set column widths for matrix
  const matrixCols = [
    { wch: 12 }, // Emp ID
    { wch: 22 }, // Name
    { wch: 20 }, // Dept
    { wch: 22 }, // Role
    { wch: 10 }, // Shift
  ];
  for (let i = 1; i <= totalDaysInMonth; i++) {
    matrixCols.push({ wch: 7 }); // Day cols
  }
  matrixCols.push({ wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 15 });
  matrixWorksheet['!cols'] = matrixCols;

  // Set column widths for details
  detailWorksheet['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }
  ];

  // Set column widths for dept
  deptWorksheet['!cols'] = [
    { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 22 }
  ];

  // Append sheets
  XLSX.utils.book_append_sheet(workbook, matrixWorksheet, 'Monthly Matrix');
  XLSX.utils.book_append_sheet(workbook, detailWorksheet, 'Daily Logs');
  XLSX.utils.book_append_sheet(workbook, deptWorksheet, 'Dept Analytics');

  // Export and download
  const filename = `Attendance_Report_${monthName}_${year}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Generates an Individual Person Attendance Excel Sheet
 */
export function exportPersonAttendanceExcel(
  member: Member,
  records: AttendanceRecord[]
) {
  const memberRecords = records
    .filter(r => r.memberId === member.id)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  let presentCount = 0;
  let lateCount = 0;
  let halfDayCount = 0;
  let absentCount = 0;
  let excusedCount = 0;

  memberRecords.forEach(r => {
    if (r.status === 'present') presentCount++;
    else if (r.status === 'late') lateCount++;
    else if (r.status === 'half_day') halfDayCount++;
    else if (r.status === 'absent') absentCount++;
    else if (r.status === 'excused') excusedCount++;
  });

  const totalLogs = memberRecords.length;
  const effectiveScore = presentCount + lateCount + (halfDayCount * 0.5);
  const attendanceRate = totalLogs > 0 ? Math.round((effectiveScore / totalLogs) * 100) : 0;
  const punctualityScore = (presentCount + lateCount) > 0 ? Math.round((presentCount / (presentCount + lateCount)) * 100) : 0;

  const profileRows: (string | number)[][] = [
    [`INDIVIDUAL ATTENDANCE DOSSIER - ${member.name.toUpperCase()}`],
    [`Employee ID: ${member.employeeId}`, `Department: ${member.department}`, `Role: ${member.role}`],
    [`Email: ${member.email}`, `Phone: ${member.phone || 'N/A'}`, `Join Date: ${member.joinDate}`, `Shift: ${member.shift.toUpperCase()}`],
    [],
    ['KEY PERFORMANCE METRICS'],
    ['Metric', 'Value'],
    ['Overall Attendance Rate', `${attendanceRate}%`],
    ['Punctuality Score', `${punctualityScore}%`],
    ['Total Days Tracked', totalLogs],
    ['Present Days', presentCount],
    ['Late Arrivals', lateCount],
    ['Half Days', halfDayCount],
    ['Absent Days', absentCount],
    ['Leaves / Excused', excusedCount],
    [],
    ['DETAILED ATTENDANCE HISTORY LOGS'],
    ['Date', 'Day', 'Status', 'Check-In Time', 'Check-Out Time', 'Duration', 'Notes / Remarks', 'Last Updated']
  ];

  memberRecords.forEach(r => {
    const recordDate = new Date(`${r.date}T00:00:00`);
    const dayName = recordDate.toLocaleDateString('default', { weekday: 'long' });
    const hours = calculateWorkingHours(r.checkInTime, r.checkOutTime);

    profileRows.push([
      r.date,
      dayName,
      getStatusLabel(r.status),
      r.checkInTime || '-',
      r.checkOutTime || '-',
      hours,
      r.notes || '-',
      r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'
    ]);
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(profileRows);

  sheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 32 },
    { wch: 22 }
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Member Dossier');

  const filename = `Attendance_${member.name.replace(/\s+/g, '_')}_${member.employeeId}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Quick CSV Export for the current date or filtered table
 */
export function exportDailyAttendanceCSV(
  date: string,
  members: Member[],
  records: AttendanceRecord[]
) {
  const dateRecords = new Map(records.filter(r => r.date === date).map(r => [r.memberId, r]));
  
  const headers = ['Employee ID', 'Name', 'Department', 'Role', 'Status', 'Check-In', 'Check-Out', 'Working Hours', 'Notes'];
  const rows = members.map(m => {
    const rec = dateRecords.get(m.id);
    const status = rec ? getStatusLabel(rec.status) : 'Unmarked';
    const checkIn = rec?.checkInTime || '';
    const checkOut = rec?.checkOutTime || '';
    const hours = rec ? calculateWorkingHours(rec.checkInTime, rec.checkOutTime) : '';
    const notes = (rec?.notes || '').replace(/,/g, ';');

    return [
      `"${m.employeeId}"`,
      `"${m.name}"`,
      `"${m.department}"`,
      `"${m.role}"`,
      `"${status}"`,
      `"${checkIn}"`,
      `"${checkOut}"`,
      `"${hours}"`,
      `"${notes}"`
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Daily_Attendance_${date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
