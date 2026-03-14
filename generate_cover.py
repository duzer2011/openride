from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import os

def generate_cover(output_path, route_name, subtitle, miles, states, tagline):
    """Generate a branded cover page for a full trace guide."""

    # Brand colors
    FOREST  = HexColor('#2C4A2E')
    MOSS    = HexColor('#4A7C59')
    SAGE    = HexColor('#8AAF8A')
    PARCH   = HexColor('#F4EFE4')
    ACCENT  = HexColor('#C17F3A')

    w, h = letter
    c = canvas.Canvas(output_path, pagesize=letter)

    # Background
    c.setFillColor(FOREST)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Top accent bar
    c.setFillColor(ACCENT)
    c.rect(0, h - 6, w, 6, fill=1, stroke=0)

    # OpenRide.bike wordmark
    c.setFillColor(PARCH)
    c.setFont('Helvetica', 11)
    c.drawString(54, h - 48, 'OPENRIDE')
    c.setFillColor(ACCENT)
    c.drawString(54 + c.stringWidth('OPENRIDE', 'Helvetica', 11), h - 48, '.BIKE')

    # Route label
    c.setFillColor(ACCENT)
    c.setFont('Helvetica', 9)
    c.drawString(54, h - 120, 'SELF-GUIDED CYCLING GUIDE')

    # Route name — large
    c.setFillColor(PARCH)
    c.setFont('Helvetica-Bold', 52)
    # Split route name into lines
    for i, line in enumerate(route_name.split('\n')):
        c.drawString(54, h - 175 - (i * 60), line.upper())

    # Subtitle
    c.setFillColor(SAGE)
    c.setFont('Helvetica', 18)
    c.drawString(54, h - 175 - (len(route_name.split('\n')) * 60) - 20, subtitle)

    # Divider line
    y_div = h - 175 - (len(route_name.split('\n')) * 60) - 55
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.5)
    c.line(54, y_div, w - 54, y_div)

    # Stats row
    stats = [
        (miles, 'Total Miles'),
        (states, 'States'),
        ('NPS', 'Protected Parkway'),
        ('Beginner', 'Difficulty'),
    ]
    stat_x = 54
    stat_y = y_div - 50
    col_w = (w - 108) / len(stats)
    for val, lbl in stats:
        c.setFillColor(PARCH)
        c.setFont('Helvetica-Bold', 22)
        c.drawString(stat_x, stat_y, str(val))
        c.setFillColor(SAGE)
        c.setFont('Helvetica', 8)
        c.drawString(stat_x, stat_y - 16, lbl.upper())
        stat_x += col_w

    # Tagline
    c.setFillColor(HexColor('#8AAF8A'))
    c.setFont('Helvetica-Oblique', 13)
    c.drawString(54, h/2 - 60, f'"{tagline}"')

    # What's inside box
    box_y = 200
    c.setFillColor(HexColor('#1e2a1f'))
    c.roundRect(54, box_y, w - 108, 140, 4, fill=1, stroke=0)

    c.setFillColor(ACCENT)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(72, box_y + 118, "WHAT'S INCLUDED")

    includes = [
        '✓  Day-by-day route guide — every mile from start to finish',
        '✓  GPX file — Garmin, Wahoo, Komoot, RideWithGPS ready',
        '✓  Complete cue sheet — turn by turn, all three segments',
        '✓  Lodging recommendations at every overnight stop',
        '✓  All free NPS campsites on the Trace',
        '✓  Resupply points and services for all 444 miles',
    ]
    c.setFillColor(PARCH)
    c.setFont('Helvetica', 9)
    for i, line in enumerate(includes):
        c.drawString(72, box_y + 96 - (i * 16), line)

    # Bottom bar
    c.setFillColor(HexColor('#1e2a1f'))
    c.rect(0, 0, w, 60, fill=1, stroke=0)
    c.setFillColor(SAGE)
    c.setFont('Helvetica', 8)
    c.drawString(54, 24, 'openride.bike')
    c.setFillColor(HexColor('#4a4a3a'))
    c.setFont('Helvetica', 7)
    c.drawCentredString(w/2, 24, 'Your route. Your pace. Your adventure.')
    c.setFillColor(SAGE)
    c.setFont('Helvetica', 8)
    c.drawRightString(w - 54, 24, 'hello@openride.bike')

    c.save()
    print(f"Cover page saved to {output_path}")


# Generate the Natchez Trace full guide cover
generate_cover(
    output_path=r'C:\OpenRide.bike\pdfs\natchez-trace-cover.pdf',
    route_name='Natchez Trace\nParkway',
    subtitle='Complete Cycling Guide — All 444 Miles',
    miles='444',
    states='3',
    tagline='By Day 2 you stop waiting for the roar that never comes. The silence is the whole point.',
)
