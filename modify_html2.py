with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find and extract prestigeUpgrades section
prestige_start = None
prestige_end = None
for i, line in enumerate(lines):
    if '<div id="prestigeUpgrades"' in line:
        prestige_start = i
    if prestige_start is not None and prestige_end is None:
        if '</div>' in line and i > prestige_start + 3:  # After the 3 buttons
            prestige_end = i
            break

if prestige_start and prestige_end:
    # Extract the prestigeUpgrades lines
    prestige_lines = lines[prestige_start:prestige_end+1]

    # Remove them from original position (and the closing </div></div> after)
    # Find how many closing divs follow
    closing_divs_after = 0
    for i in range(prestige_end+1, min(prestige_end+3, len(lines))):
        if lines[i].strip() == '</div>':
            closing_divs_after += 1
        else:
            break

    # Remove prestigeUpgrades and any closing divs that were meant for score div
    del lines[prestige_start:prestige_end+1]

    # Find the Anal() line and insert prestigeUpgrades after it
    for i, line in enumerate(lines):
        if 'Click this to enable AI score gain breakdown' in line:
            # Insert prestigeUpgrades with proper indentation
            indent = '            '
            prestige_indented = [indent + pline.lstrip() for pline in prestige_lines]
            lines[i+1:i+1] = prestige_indented
            break

with open('index.html', 'w', encoding='utf-8', newline='\r\n') as f:
    f.writelines(lines)

print("HTML restructuring completed")
