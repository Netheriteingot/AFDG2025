import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add CSS animation for background cycle in <head>
style_tag = '''<style>
@keyframes bgCycle {
    0% { background-color: white; color: black; }
    25% { background-color: red; color: white; }
    50% { background-color: green; color: white; }
    75% { background-color: blue; color: white; }
    100% { background-color: white; color: black; }
}
</style>
'''

# Insert before </head>
content = content.replace('</head>', style_tag + '</head>')

# Step 2: Move #prestigeUpgrades inside the left column div
# Extract the prestigeUpgrades section
prestige_pattern = r'(\s*)<div id="prestigeUpgrades"[^>]*>.*?</div>\s*</div>\s*</div>'
prestige_match = re.search(prestige_pattern, content, re.DOTALL)

if prestige_match:
    prestige_section = prestige_match.group(0)
    # Remove it from current location (including the two closing </div>s)
    content = content.replace(prestige_section, '\r\n    </div>\r\n    </div>')

    # Extract just the prestigeUpgrades div
    prestige_div_pattern = r'<div id="prestigeUpgrades"[^>]*>.*?</div>\s*</div>'
    prestige_div_match = re.search(prestige_div_pattern, prestige_section, re.DOTALL)
    prestige_div = prestige_div_match.group(0).rsplit('</div>', 1)[0] + '</div>'

    # Insert it before the closing </div> of the left column (after the Anal div)
    left_col_pattern = r'(<div onclick="Anal\(\)">.*?</div>)\r\n(\s*)</div>\r\n(\s*)<div id="aipanel"'
    replacement = r'\1\r\n\2    ' + prestige_div + r'\r\n\2</div>\r\n\3<div id="aipanel"'
    content = re.sub(left_col_pattern, replacement, content, flags=re.DOTALL)

# Step 3: Add animation to #aipanel
content = content.replace(
    'background: rgba(0,0,0,0.6); color: white;',
    'animation: bgCycle 4s infinite;'
)

with open('index.html', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(content)

print("HTML modifications completed")
