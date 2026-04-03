import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SystemUser, AttendanceEntry } from '../types';

interface PunchReportParams {
  user: SystemUser;
  logs: AttendanceEntry[];
  startDate: Date;
  endDate: Date;
  generatedBy: string;
}

export function generatePunchReportPDF(params: PunchReportParams): void {
  const { user, logs, startDate, endDate, generatedBy } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(120, 53, 15);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Portão da Cerveja', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Espelho de Ponto', 14, 20);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(user.name, 14, 38);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Cargo: ${user.role === 'EMPLOYEE' ? 'Funcionário' : user.role}`, 14, 44);
  doc.text(`Email: ${user.email}`, 14, 49);

  const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
  doc.text(`Período: ${fmt(startDate)} até ${fmt(endDate)}`, 14, 54);
  doc.text(`Gerado por: ${generatedBy} em ${fmt(new Date())}`, 14, 59);

  const filteredLogs = logs
    .filter(l => l.timestamp >= startDate.getTime() && l.timestamp <= endDate.getTime())
    .sort((a, b) => a.timestamp - b.timestamp);

  const rows = filteredLogs.map(log => {
    const d = new Date(log.timestamp);
    return [
      d.toLocaleDateString('pt-BR'),
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      log.type === 'ENTRADA' ? 'Entrada' : 'Saída',
      log.location?.address || log.location?.locationName || '—',
      log.isForced ? 'Forçada (gestão)' : '—',
    ];
  });

  autoTable(doc, {
    startY: 66,
    head: [['Data', 'Hora', 'Tipo', 'Local', 'Obs.']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [120, 53, 15], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 243, 199] },
    columnStyles: { 3: { cellWidth: 55 } },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const entries = filteredLogs
    .filter(l => l.type === 'ENTRADA')
    .sort((a, b) => a.timestamp - b.timestamp);
  const exits = filteredLogs
    .filter(l => l.type === 'SAIDA')
    .sort((a, b) => a.timestamp - b.timestamp);
  let totalMs = 0;
  entries.forEach((e, i) => {
    if (exits[i]) totalMs += exits[i].timestamp - e.timestamp;
  });
  const totalH = Math.floor(totalMs / 3_600_000);
  const totalM = Math.floor((totalMs % 3_600_000) / 60_000);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(`Total de registros: ${filteredLogs.length}`, 14, finalY);
  doc.text(`Horas trabalhadas: ${totalH}h ${totalM}m`, 14, finalY + 5);
  doc.text(`Pontos acumulados: ${user.points || 0} ★`, 14, finalY + 10);

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Documento gerado pelo sistema Portão da Cerveja © 2026',
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );

  const monthStr = startDate
    .toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
    .replace('/', '-');
  const nameSlug = user.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  doc.save(`espelho-ponto-${nameSlug}-${monthStr}.pdf`);
}
