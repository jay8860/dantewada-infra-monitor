import os
from io import BytesIO
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.units import inch
from PIL import Image

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
                if img_path and os.path.exists(img_path):
                    try:
                        # Add image to row
                        img = RLImage(img_path, width=2.5*inch, height=1.8*inch)
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
