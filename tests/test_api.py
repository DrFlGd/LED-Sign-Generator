import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()
    def request(self,path,body=None,headers=None):
        conn=http.client.HTTPConnection(*self.http.server_address)
        conn.request('GET' if body is None else 'POST',path,
                     body=None if body is None else json.dumps(body),headers=headers or {})
        r=conn.getresponse(); result=(r.status,r.read());conn.close();return result
    def test_static_and_config(self):
        self.assertEqual(self.request('/')[0],200)
        code,body=self.request('/api/config')
        self.assertEqual(code,200);self.assertIn('defaults',json.loads(body))
    def test_roundtrip(self):
        code,body=self.request('/api/validate',server.project(server.DEFAULTS))
        self.assertEqual(code,200);self.assertEqual(json.loads(body),server.DEFAULTS)
    def test_bad_request_and_origin(self):
        self.assertEqual(self.request('/api/validate',{'height':False})[0],400)
        self.assertEqual(self.request('/api/validate',{}, {'Origin':'https://untrusted.example'})[0],403)
        self.assertEqual(self.request('/api/config',headers={'Host':'untrusted.example'})[0],403)
        self.assertEqual(self.request('/../server.py')[0],404)
    def test_source_download(self):
        code,body=self.request('/api/scad',{'sign_text':'QUOTE " \\ TEST'})
        self.assertEqual(code,200);self.assertIn(b'"QUOTE \\" \\\\ TEST"',body)

if __name__=='__main__': unittest.main()
