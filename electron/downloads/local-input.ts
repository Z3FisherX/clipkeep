export const LOCAL_FORMATS = 'mov,matroska,webm,mpegts,aac,mp3,ogg,wav,flac,avi,flv';
export const LOCAL_INPUT_ARGS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', LOCAL_FORMATS];
export const LOCAL_POSTPROCESSOR_ARGS = `ffmpeg_i:-protocol_whitelist file,pipe -format_whitelist ${LOCAL_FORMATS}`;
