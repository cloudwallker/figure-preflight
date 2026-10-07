"""Reproducible synthetic fixtures; Python is development-only."""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

PROFILE = {'matplotlib': '3.9.4', 'fonttype': 'none', 'usetex': False,
           'family': 'DejaVu Sans', 'style': 'normal', 'weight': 'normal',
           'hashsalt': 'figure-preflight-fixtures-v1', 'date': None}
RC = {'svg.fonttype': 'none', 'text.usetex': False, 'font.family': 'DejaVu Sans',
      'font.style': 'normal', 'font.weight': 'normal', 'font.size': 8,
      'text.parse_math': False, 'svg.hashsalt': PROFILE['hashsalt']}
NS = '{http://www.w3.org/2000/svg}'

def export(fig, fonttype='none'):
    stream = io.StringIO()
    with matplotlib.rc_context({'svg.fonttype': fonttype}):
        fig.savefig(stream, format='svg', metadata={'Date': None})
    return stream.getvalue()

def chart(fixed=False):
    fig, ax = plt.subplots(figsize=(85/25.4, 55/25.4))
    line, = ax.plot([0, 1, 2], [0.2, 0.8, 0.5], color='#cc3333', marker='o',
                    linewidth=0.8 if fixed else 0.15, label='HIM')
    line.set_gid('thin-line')
    ax.plot([0, 1, 2], [0.8, 0.4, 0.6], color='#339944', linewidth=0.8)
    ax.set(xlabel='Time', ylabel='Value', ylim=(0, 1))
    ax.text(.3, .25, 'HIM', fontsize=7 if fixed else 5, ha='left', gid='small-label-a')
    ax.text(1.5, .15, 'HIM', fontsize=7 if fixed else 5.5, ha='center', gid='small-label-b')
    legend=ax.legend(loc='upper left', fontsize=7 if fixed else 5.75)
    legend.get_texts()[0].set_gid('small-legend')
    for handle in legend.legend_handles:
        handle.set_linewidth(0.8)
    text=export(fig);plt.close(fig);return text

def independent():
    fig=plt.figure(figsize=(2,1))
    fig.text(.25,.5,'HIM',fontsize=8,gid='known-text')
    from matplotlib.lines import Line2D
    fig.add_artist(Line2D([.1,.9],[.2,.2],transform=fig.transFigure,linewidth=.5,gid='known-line'))
    text=export(fig);plt.close(fig);return text

def outline_and_mixed():
    fig=plt.figure(figsize=(2,1))
    fig.text(.1,.6,'HIM',fontsize=8,gid='outline-label')
    fig.text(.1,.3,'ABC',fontsize=8,gid='retained-label')
    none=export(fig);path=export(fig,'path');plt.close(fig)
    nr,pr=ET.fromstring(none),ET.fromstring(path)
    # The complete path-label group carries its actual nested glyph definitions.
    target=next(e for e in pr.iter() if e.get('id')=='outline-label')
    replacement=copy.deepcopy(target)
    id_map={e.get('id'):'mixed-'+e.get('id') for e in replacement.iter() if e.get('id')}
    for e in replacement.iter():
        if e.get('id'):e.set('id',id_map[e.get('id')])
        for key,value in list(e.attrib.items()):
            if key.endswith('href') and value.startswith('#'):e.set(key,'#'+id_map[value[1:]])
    for parent in nr.iter():
        for index,child in enumerate(list(parent)):
            if child.get('id')=='outline-label':parent.remove(child);parent.insert(index,replacement)
    ET.register_namespace('',NS[1:-1]);ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
    return path,ET.tostring(nr,encoding='unicode')+'\n'

def inventory(files):
    result={}
    for name,text in files.items():
        root=ET.fromstring(text);elements={};styles=set()
        for e in root.iter():
            tag=e.tag.split('}')[-1];elements.setdefault(tag,set()).update(e.attrib)
            if 'style' in e.attrib:styles.add(e.attrib['style'])
        result[name]={'sha256':hashlib.sha256(text.encode()).hexdigest(),
          'root':root.attrib,'elements':{k:sorted(v) for k,v in sorted(elements.items())},
          'inlineStyles':sorted(styles),'stylesheets':[e.text for e in root.iter(NS+'style')],
          'prolog':text.split('<svg')[0],
          'counts':{tag:sum(1 for e in root.iter() if e.tag.split('}')[-1]==tag) for tag in sorted(elements)}}
    return result

def serialized(root):
    ET.register_namespace('',NS[1:-1]);ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
    return ET.tostring(root,encoding='unicode')+'\n'

def variant(text, number):
    root=ET.fromstring(text)
    targets=[e for e in root.iter() if e.get('id') in ('known-text','known-line')]
    if number in (4,5,13):
        for e in targets:e.set('transform',{4:'rotate(20 72 36)',5:'translate(20 10) scale(.5)',13:'skewX(20) scale(1.5 1)'}[number])
    if number==6:
        root.set('viewBox','10 20 144 72')
        for child in list(root):
            if child.tag==NS+'g':child.set('transform','translate(10 20)')
    text_node=next(root.iter(NS+'text'))
    if number==7:
        text_node.attrib.pop('style');next(e for e in targets if e.get('id')=='known-text').set('style',"font: 8px 'DejaVu Sans'")
    if number==8:text_node.set('style',"font: 6pt 'DejaVu Sans'")
    if number==9:
        text_node.set('style',"font: 6px 'DejaVu Sans'")
        line=next(e for t in targets if t.get('id')=='known-line' for e in t.iter(NS+'path'));line.set('style','fill: none; stroke: #000000; stroke-width: 0.25')
    if number==10:
        text_node.attrib.pop('style');text_node.text=None
        for x,size in [(36,8),(72,5)]:
            span=ET.SubElement(text_node,NS+'tspan',{'x':str(x),'y':'36','style':f"font: {size}px 'DejaVu Sans'"});span.text='HIM'
    if number==14:
        for t in targets:
            if t.get('id')=='known-line':
                for e in t.iter(NS+'path'):e.set('vector-effect','non-scaling-stroke')
    return serialized(root)

def measurement_sample(index):
    from matplotlib.lines import Line2D
    fig=plt.figure(figsize=(2,1))
    small=4.5+(index%5)*.2;thin=.1+(index%4)*.025;anchor=['left','center','right'][index%3]
    fig.text(.2+(index%4)*.16,.66,'HIM',fontsize=small,ha=anchor,gid='small-text')
    fig.text(.24+(index%3)*.12,.26,'HIM',fontsize=8,ha=anchor,gid='ordinary-text')
    fig.add_artist(Line2D([.12,.82],[.48,.48],transform=fig.transFigure,linewidth=thin,gid='thin-line'))
    fig.add_artist(Line2D([.15,.8],[.12,.12],transform=fig.transFigure,linewidth=.8,gid='ordinary-line'))
    text=export(fig);plt.close(fig)
    return text,{'widthMm':50.8,'smallPt':small,'thinPt':thin,'ordinaryTextPt':8,'ordinaryStrokePt':.8,'anchor':anchor,'generatorIndex':index}

def delivery_themes(base):
    root=ET.fromstring(base)
    for text in root.iter(NS+'text'):text.set('style',"font: 8px 'FigurePreflight Missing Font'")
    shell='<svg xmlns="http://www.w3.org/2000/svg" width="144pt" height="72pt" viewBox="0 0 144 72">'
    return {
        '15-missing-font.svg':serialized(root),
        '16-clip-use.svg':shell+'<defs><rect id="shape" width="20" height="20" fill="#cc3333" stroke="#000000" stroke-width="0.1"/><clipPath id="window"><rect x="10" y="10" width="50" height="40"/></clipPath></defs><g clip-path="url(#window)"><use href="#shape" x="15" y="15"/><use href="#shape" x="55" y="15"/></g><text x="10" y="65" font-size="8px" font-family="DejaVu Sans">HIM</text></svg>\n',
        '17-alpha-color-patches.svg':shell+'<rect width="48" height="72" fill="#cc3333"/><rect x="48" width="48" height="72" fill="#339944" opacity="0.5"/><rect x="96" width="48" height="72" fill="#132c5b" fill-opacity="0.75"/></svg>\n',
        '18-security-mutation.svg':shell+'<script>globalThis.fixtureExecuted=true</script><text x="10" y="20" font-size="8px">unsafe fixture</text></svg>\n',
        '19-limit-boundaries.svg':shell+'<g/>'*4096+'</svg>\n',
        '20-parse-invalid.svg':'<svg xmlns="http://www.w3.org/2000/svg" width="0pt" height="72pt" viewBox="0 0 144 72"><text x="10" y="20" font-size="8px">invalid root</text></svg>\n',
    }

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='fixtures');parser.add_argument('--include-counterexamples',action='store_true');args=parser.parse_args()
    if matplotlib.__version__!='3.9.4':raise RuntimeError('Matplotlib 3.9.4 required')
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    with matplotlib.rc_context(RC):
        files={'01-bad.svg':chart(),'02-fixed.svg':chart(True),'03-144pt.svg':independent()}
        for number,name in [(4,'rotate'),(5,'uniform'),(6,'nonzero-viewbox'),(7,'inheritance'),(8,'units'),(9,'equality'),(10,'tspan'),(13,'nonuniform'),(14,'vector-effect')]:
            files[f'{number:02}-{name}.svg']=variant(files['03-144pt.svg'],number)
        files['11-outline.svg'],files['12-mixed.svg']=outline_and_mixed()
        measurement={}
        for index in range(21,40):files[f'{index}-measurement.svg'],measurement[f'{index}-measurement.svg']=measurement_sample(index)
        files.update(delivery_themes(files['03-144pt.svg']))
    observed=inventory(files)
    expected={'profile':PROFILE,'profileId':'matplotlib-text-svg-v1',
              'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'files':{name:{'sha256':observed[name]['sha256']} for name in files}}
    expected['files']['01-bad.svg'].update({'widthMm':85,'textPt':{'small-label-a':5,'small-label-b':5.5,'small-legend':5.75},'strokePt':{'thin-line':.15},'ordinaryTextMinPt':7,'labelText':'HIM','legendSource':'Axes.legend'})
    expected['files']['02-fixed.svg'].update({'widthMm':85,'textPt':{'small-label-a':7,'small-label-b':7,'small-legend':7},'strokePt':{'thin-line':.8}})
    expected['files']['03-144pt.svg'].update({'at50_8mm':{'fontPt':8,'strokePt':.5},'at25_4mm':{'fontPt':4,'strokePt':.25},'basis':'2 inch figure equals 144 pt; independent 72 pt per inch'})
    for name,truth in measurement.items():expected['files'][name].update(truth)
    for name,text in files.items():(out/name).write_text(text,encoding='utf-8',newline='\n')
    for name,data in [('expected.json',expected),('profile-observed.json',observed)]:
        (out/name).write_text(json.dumps(data,indent=2,ensure_ascii=True)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'generated':list(files),'matplotlib':matplotlib.__version__}))

if __name__=='__main__':main()
