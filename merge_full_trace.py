from pypdf import PdfWriter, PdfReader
import os

def merge_full_trace(output_path, lodging_style='bnb', season='spring'):
    """
    Merge cover + three segment guides into one full trace PDF.
    lodging_style: 'bnb', 'camping', or 'mixed'
    season: 'spring', 'fall', 'summer', 'winter'
    """

    base = r'C:\OpenRide.bike\pdfs'

    # Map lodging/season to existing PDF filenames
    # As middle and upper guides are built, add them here
    segment_map = {
        'lower': {
            'bnb':     'natchez-lower-guide-new.pdf',
            'camping': 'natchez-lower-guide-new.pdf',
            'mixed':   'natchez-lower-guide-new.pdf',
        },
        'middle': None,  # not yet built
        'upper':  None,  # not yet built
    }

    pdfs_to_merge = ['natchez-trace-cover.pdf']

    lower_file = segment_map['lower'].get(lodging_style, 'natchez-moderate-bnb-spring.pdf')
    pdfs_to_merge.append(lower_file)

    # Middle and upper: add when available
    # pdfs_to_merge.append(segment_map['middle'][lodging_style])
    # pdfs_to_merge.append(segment_map['upper'][lodging_style])

    writer = PdfWriter()

    for filename in pdfs_to_merge:
        filepath = os.path.join(base, filename)
        if not os.path.exists(filepath):
            print(f"WARNING: {filepath} not found — skipping")
            continue
        reader = PdfReader(filepath)
        for page in reader.pages:
            writer.add_page(page)
        print(f"Added: {filename} ({len(reader.pages)} pages)")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'wb') as f:
        writer.write(f)

    print(f"\nFull trace guide saved: {output_path}")
    print(f"Total pages: {sum(1 for _ in writer.pages)}")


# Test merge
merge_full_trace(
    output_path=r'C:\OpenRide.bike\pdfs\natchez-trace-full-bnb-spring.pdf',
    lodging_style='bnb',
    season='spring'
)
