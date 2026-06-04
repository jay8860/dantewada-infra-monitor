import os
from io import BytesIO
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.units import inch
from PIL import Image
import image_utils

def build_visual_pdf(works_data):
    """
    Given a list of works dictionaries (same format as returned by GET /works),
    this generates a PDF buffer showcasing the works and their photos side-by-side.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1E3A8A'), spaceAfter=14)
    heading_style = ParagraphStyle('WorkHeading', parent=styles['Heading2'], fontSize=12, textColor=colors.black, spaceAfter=6)
    normal_style = ParagraphStyle('NormalStyle', parent=styles['Normal'], fontSize=10, textColor=colors.darkgrey)
    status_style = ParagraphStyle('StatusStyle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#D97706'), fontName='Helvetica-Bold')

    elements = []
    
    # Title
    elements.append(Paragraph("Dantewada Infrastructure - Visual Inspection Report", title_style))
    elements.append(Spacer(1, 0.2 * inch))

    # Process each work
    for work in works_data:
        # Title of Work
        work_title = f"[{work['work_code']}] {work['work_name']}"
        elements.append(Paragraph(work_title, heading_style))
        
        # Detail line
        details_text = (
            f"<b>Agency:</b> {work.get('agency_name', 'N/A')} | "
            f"<b>Block:</b> {work.get('block', 'N/A')} | "
            f"<b>Sanctioned:</b> ₹{work.get('sanctioned_amount', 0)} Lakhs | "
            f"<b>Status:</b> {work.get('current_status', 'N/A')}"
        )
        elements.append(Paragraph(details_text, normal_style))
        
        if work.get('admin_remarks'):
            elements.append(Paragraph(f"<b>Admin Remarks:</b> {work['admin_remarks']}", normal_style))
            
        elements.append(Spacer(1, 0.1 * inch))
        
        # Photos Table
        photos = work.get('photos', [])
        if photos:
            # We will show up to 3 most recent photos side by side
            recent_photos = photos[:3]
            img_row = []
            caption_row = []
            
            for p in recent_photos:
                img_path = p.get('thumbnail_path') or p.get('image_path')
                resolved_img_path = image_utils.resolve_upload_path(img_path)
                if resolved_img_path and os.path.exists(resolved_img_path):
                    try:
                        # Add image to row
                        img = RLImage(resolved_img_path, width=2.5*inch, height=1.8*inch)
                        img_row.append(img)
                        # Build caption
                        cat = p.get('category', 'Unknown')
                        date = p.get('uploaded_at', '')[:10] if p.get('uploaded_at') else 'N/A'
                        caption_row.append(Paragraph(f"<b>{cat}</b> ({date})", normal_style))
                    except Exception as e:
                        img_row.append(Paragraph("[Image Error]", normal_style))
                        caption_row.append(Paragraph("", normal_style))
                        
            if img_row:
                # Pad if less than 3
                while len(img_row) < 3:
                    img_row.append("")
                    caption_row.append("")
                
                t = Table([img_row, caption_row], colWidths=[2.6*inch, 2.6*inch, 2.6*inch])
                t.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ]))
                elements.append(t)
        else:
            elements.append(Paragraph("<i>No photos available for this work.</i>", normal_style))
            
        elements.append(Spacer(1, 0.3 * inch))
        
    doc.build(elements)
    buffer.seek(0)
    return buffer


def build_agency_photo_report_pdf(report_rows, summary):
    """Generate an agency-wise PDF report for inspection photo coverage."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=28, bottomMargin=24)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('AgencyPhotoTitle', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1E3A8A'), spaceAfter=8)
    subtitle_style = ParagraphStyle('AgencyPhotoSubtitle', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#475569'), spaceAfter=12)
    metric_style = ParagraphStyle('MetricStyle', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#111827'), alignment=1)
    header_style = ParagraphStyle('TableHeader', parent=styles['Normal'], fontSize=8, textColor=colors.white, fontName='Helvetica-Bold', alignment=1)
    cell_style = ParagraphStyle('TableCell', parent=styles['Normal'], fontSize=7.5, leading=9, textColor=colors.HexColor('#111827'))
    center_cell_style = ParagraphStyle('CenterCell', parent=cell_style, alignment=1)
    remark_style = ParagraphStyle('RemarkCell', parent=cell_style, fontSize=7, leading=8.5)

    elements = [
        Paragraph("Dantewada Infrastructure - Agency Photo Inspection Report", title_style),
        Paragraph(
            f"Generated on {summary.get('generated_at', 'N/A')} | "
            f"Agencies: {summary.get('agency_count', 0)} | "
            f"Works needing photo inspection: {summary.get('total_works', 0)} | "
            f"Works with photos: {summary.get('works_with_photos', 0)} | "
            f"Works without photos: {summary.get('works_without_photos', 0)}",
            subtitle_style
        )
    ]

    overview_data = [[
        Paragraph("<b>Overall Coverage</b><br/>" + summary.get('coverage_text', '0%'), metric_style),
        Paragraph("<b>Total Photos</b><br/>" + str(summary.get('total_photos', 0)), metric_style),
        Paragraph("<b>Average Photos / Work</b><br/>" + summary.get('average_photos_text', '0.00'), metric_style),
        Paragraph("<b>Pending Works</b><br/>" + str(summary.get('works_without_photos', 0)), metric_style),
    ]]
    overview = Table(overview_data, colWidths=[2.1 * inch, 2.1 * inch, 2.1 * inch, 2.1 * inch])
    overview.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(overview)
    elements.append(Spacer(1, 0.18 * inch))

    headers = [
        "Agency",
        "Works Needing Photos",
        "Works With Photos",
        "Works Without Photos",
        "Total Photos",
        "Avg Photos / Work",
        "Coverage",
        "Latest Photo",
        "Remark",
    ]
    table_data = [[Paragraph(h, header_style) for h in headers]]

    for row in report_rows:
        table_data.append([
            Paragraph(str(row.get('agency', 'Unknown')), cell_style),
            Paragraph(str(row.get('total_works', 0)), center_cell_style),
            Paragraph(str(row.get('works_with_photos', 0)), center_cell_style),
            Paragraph(str(row.get('works_without_photos', 0)), center_cell_style),
            Paragraph(str(row.get('total_photos', 0)), center_cell_style),
            Paragraph(f"{row.get('average_photos_per_work', 0):.2f}", center_cell_style),
            Paragraph(f"{row.get('coverage_percent', 0):.1f}%", center_cell_style),
            Paragraph(row.get('latest_photo_date') or "-", center_cell_style),
            Paragraph(row.get('remark', ''), remark_style),
        ])

    if len(table_data) == 1:
        table_data.append([
            Paragraph("No works found for the selected filters.", cell_style),
            "", "", "", "", "", "", "", ""
        ])

    table = Table(
        table_data,
        repeatRows=1,
        colWidths=[1.6 * inch, 0.85 * inch, 0.75 * inch, 0.8 * inch, 0.65 * inch, 0.75 * inch, 0.65 * inch, 0.75 * inch, 2.45 * inch]
    )
    table_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E3A8A')),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ])

    for idx, row in enumerate(report_rows, start=1):
        background = colors.white if idx % 2 else colors.HexColor('#F8FAFC')
        table_style.add('BACKGROUND', (0, idx), (-1, idx), background)
        if row.get('works_without_photos', 0) > 0:
            table_style.add('TEXTCOLOR', (3, idx), (3, idx), colors.HexColor('#B91C1C'))
        if row.get('coverage_percent', 0) >= 85:
            table_style.add('TEXTCOLOR', (6, idx), (6, idx), colors.HexColor('#15803D'))
        elif row.get('coverage_percent', 0) < 50:
            table_style.add('TEXTCOLOR', (6, idx), (6, idx), colors.HexColor('#B91C1C'))

    table.setStyle(table_style)
    elements.append(table)

    elements.append(Spacer(1, 0.12 * inch))
    elements.append(Paragraph(
        "Note: Works needing photo inspection means all works in the selected report scope. "
        "Works with photos are works where at least one inspection/site photo has been uploaded.",
        subtitle_style
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer
