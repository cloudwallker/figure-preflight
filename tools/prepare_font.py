"""Copy the licensed bundled fixture font and pin bytes and actual cmap coverage."""
import base64, hashlib, json, shutil
from pathlib import Path
import matplotlib
from fontTools.ttLib import TTFont
src=Path(matplotlib.get_data_path())/'fonts'/'ttf'
out=Path('assets');out.mkdir(exist_ok=True)
data=(src/'DejaVuSans.ttf').read_bytes();font=TTFont(src/'DejaVuSans.ttf')
shutil.copyfile(src/'LICENSE_DEJAVU',out/'LICENSE_DEJAVU')
(out/'DejaVuSans.ttf').write_bytes(data)
asset={'family':'DejaVu Sans','version':'2.35','base64':base64.b64encode(data).decode(),'sha256':hashlib.sha256(data).hexdigest(),'licenseRef':'assets/LICENSE_DEJAVU'}
(out/'font-assets.json').write_text(json.dumps(asset,indent=2)+'\n',encoding='utf-8')
coverage={'sha256':asset['sha256'],'codepoints':sorted(font.getBestCmap()),'source':'Matplotlib 3.9.4 mpl-data/fonts/ttf/DejaVuSans.ttf','names':[n.toUnicode() for n in font['name'].names if n.nameID==5]}
(out/'font-coverage.json').write_text(json.dumps(coverage,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in asset.items() if k!='base64'}));print(coverage['names'])
