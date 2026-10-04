"""Real OpenSCAD regressions: dimensions, closed meshes, cuts and fit offsets."""
import collections
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server


def triangles(path):
    b=path.read_bytes()
    return [tuple(tuple(round(x,5) for x in struct.unpack_from('<3f',b,84+50*i+12+j*12)) for j in range(3)) for i in range(struct.unpack_from('<I',b,80)[0])]


def closed_and_volume(test,path):
    edges=collections.Counter()
    volume=0
    for a,b,c in triangles(path):
        for x,y in ((a,b),(b,c),(c,a)):
            edges[tuple(sorted((x,y)))]+=1
        volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    test.assertTrue(edges)
    test.assertTrue(all(n==2 for n in edges.values()),'Every mesh edge must belong to two triangles')
    test.assertGreater(volume,0)
    return volume


class ValidationTests(unittest.TestCase):
    def test_project_roundtrip(self):
        p=server.validate({'sign_text':'A "B" \\ C'})
        self.assertEqual(server.validate(json.loads(json.dumps(server.project(p)))),p)
        self.assertIn('sign_text = "A \\"B\\" \\\\ C";',server.source(p))

    def test_invalid_inputs(self):
        for p in [{'sign_text':' '},{'height':float('nan')},{'height':True},{'height':'80'},
                  {'depth':8,'face':5,'back':2},{'clearance':1,'ledge':.5},
                  {'style':'unknown'},{'unknown':1},{'version':2,'format':'led-sign-generator'},
                  {'sign_text':'a\nb'},{'font_name':'not-installed'}]:
            with self.subTest(p=p), self.assertRaises(ValueError): server.validate(p)

@unittest.skipUnless(shutil.which(server.OPENSCAD),'OpenSCAD required')
class GeometryTests(unittest.TestCase):
    def test_letters_with_counters_and_islands(self):
        p=server.validate({'sign_text':'BOi','height':60,'recess':1})
        result=server.build(p)
        folder=Path(server.CACHE.name)/result['id']
        for part in ('body','diffuser','fit_body','fit_diffuser'):
            closed_and_volume(self,folder/f'{part}.stl')
        self.assertAlmostEqual(result['parts']['body']['size'][1],60,places=2)
        self.assertAlmostEqual(result['parts']['body']['size'][2],30,places=2)
        self.assertAlmostEqual(result['parts']['diffuser']['size'][2],1.2,places=2)
        self.assertAlmostEqual(result['parts']['diffuser']['minimum'][2],0,places=3)
        self.assertAlmostEqual(result['parts']['fit_diffuser']['size'][0],30-2*(p['wall']+p['clearance']),places=3)
        self.assertTrue((folder/'print-kit.zip').is_file())
        self.assertIn('<svg',(folder/'diffuser.svg').read_text())
        self.assertEqual(server.validate(json.loads((folder/'project.json').read_text())),p)

    def test_contour(self):
        p=server.validate({'sign_text':'O','style':'contour','height':40,'margin':6})
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);scad=folder/'sign.scad';scad.write_text(server.source(p))
            for part in ('body','diffuser'):
                path=folder/f'{part}.stl';server.render(scad,path,part);closed_and_volume(self,path)
            info=server.mesh_info(folder/'body.stl')
            self.assertAlmostEqual(info['size'][1],52,delta=.03)  # $fn polygon approximation

    def test_wall_back_and_ledge_volume(self):
        # Coupon is a square, so the stepped shell has an analytic volume.
        p=server.validate({})
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);scad=folder/'sign.scad';scad.write_text(server.source(p))
            path=folder/'fit.stl';server.render(scad,path,'fit_body')
            volume=closed_and_volume(self,path)
            expected=900*(p['back']+5+p['face'])-(30-2*(p['wall']+p['ledge']))**2*5-(30-2*p['wall'])**2*p['face']
            self.assertAlmostEqual(volume,expected,delta=.02)

if __name__=='__main__': unittest.main()
