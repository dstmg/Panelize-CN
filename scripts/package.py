from pathlib import Path
import zipfile,json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
out=root/'dist'/f'Panelize-CN-{version}.zip'
out.parent.mkdir(exist_ok=True)
directories=['_locales','assets','background','content-scripts','data','icons','libs','modules','multi-panel','options','rules']
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name in directories:
  for file in (root/name).rglob('*'):
   if file.is_file():z.write(file,file.relative_to(root))
 for name in ['manifest.json','LICENSE','README.md','PRIVACY.md']:z.write(root/name,name)
assert zipfile.ZipFile(out).testzip() is None
print(out)
