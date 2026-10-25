# cj/_invite (seed for S3)

Deploy:

1. Copy `redqueen/cj-invite/` → `C:\ai\a-search\cj-invite` on redqueen.
2. Upload this folder to `s3://a-affiliates/cj/_invite/` (`config.json` + this README).
3. Create zero-byte marker `s3://a-affiliates/cj/` with metadata `enabled=0` until account activation (#5057).
4. Run: `cd S:\a-affiliates\cj; invite -Max 3`
