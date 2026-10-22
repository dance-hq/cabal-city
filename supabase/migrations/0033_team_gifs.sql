-- Animated GIF logos and banners. The browser still cuts and shrinks every
-- frame before upload; a GIF needs more room than a still, hence 8 MB.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    file_size_limit = 8388608
where id = 'team-images';
