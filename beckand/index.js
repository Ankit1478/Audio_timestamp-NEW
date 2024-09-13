const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Set the FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Define directory paths
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');
const outputDir = path.join(__dirname, 'output');

// Create necessary directories
[uploadsDir, publicDir, outputDir].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// Configure multer to use the uploads directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    cb(null,file.originalname)
  }
});

const upload = multer({ storage: storage });

app.post('/process', upload.fields([
  { name: 'mainAudio', maxCount: 1 },
  { name: 'backgroundAudios', maxCount: 10 }
]), (req, res) => {
  if (!req.files || !req.files.mainAudio || !req.files.backgroundAudios) {
    return res.status(400).json({ error: 'Please upload one main audio file and at least one background audio file.' });
  }

  const mainAudioFile = req.files.mainAudio[0];
  const backgroundAudioFiles = req.files.backgroundAudios;
  const mainAudioFileOriginalName = path.parse(req.files.mainAudio[0].originalname).name;
  
  let backgroundAudioMetadata = [];
  if (req.body.backgroundAudioMetadata) {
    try {
      backgroundAudioMetadata = JSON.parse(req.body.backgroundAudioMetadata);
    } catch (error) {
      console.error('Error parsing backgroundAudioMetadata:', error);
      return res.status(400).json({ error: 'Invalid background audio metadata format' });
    }
  }

  console.log('Starting audio processing...');

  const outputFileName = `${mainAudioFileOriginalName}.aac`;
  const finalOutputPath = path.join(publicDir, outputFileName);

  processAudio(mainAudioFile.path, backgroundAudioFiles, backgroundAudioMetadata, finalOutputPath)
    .then(() => {
      console.log('Processing finished successfully');
      const downloadUrl = `/download/${outputFileName}`;
      res.json({ message: 'Audio processed successfully', downloadUrl });
    })
    .catch(err => {
      console.error('Error during audio processing:', err);
      res.status(500).json({ error: 'Error processing audio: ' + err.message });
    });
});

function processAudio(mainAudioPath, backgroundAudioFiles, backgroundAudioMetadata, outputPath) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg();

    // Add the main audio file
    command.input(mainAudioPath);

    // Add the background audio files
    backgroundAudioFiles.forEach(file => {
      command = command.input(file.path);
    });

    // Prepare complex filter
    const filterComplex = [];
    const mixAudio = ['0:a'];

    // Get the duration of the main audio file
    ffmpeg.ffprobe(mainAudioPath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        reject(err);
        return;
      }

      

      const mainDuration = metadata.format.duration;

      backgroundAudioFiles.forEach((file, index) => {
        const metadata = backgroundAudioMetadata[index] || {};
        const inputIndex = index + 1;
        const delay = (metadata.timestamp || 0) * 1000; 
        const volume = Math.min(metadata.volume || 1, 1);
        const duration = Math.min(metadata.duration || mainDuration, mainDuration - (metadata.timestamp || 0));
        const outputLabel = `delayed${inputIndex}`;

        console.log(`Background Audio ${inputIndex}: Added at ${metadata.timestamp}s into the track`);

        // Apply volume adjustment, delay, and duration to background audio files
        filterComplex.push(`[${inputIndex}:a]volume=${volume},atrim=duration=${duration},asetpts=PTS-STARTPTS,adelay=${delay}|${delay}[${outputLabel}]`);
        mixAudio.push(outputLabel);
      });

      // Mix all audio streams
      filterComplex.push(`[${mixAudio.join('][')}]amix=inputs=${mixAudio.length}:duration=first,atrim=duration=${mainDuration}[out]`);

      command
        .complexFilter(filterComplex, 'out')
        .audioCodec('aac')
        .audioBitrate('128k')
        .toFormat('adts')
        .duration(mainDuration)
        .on('start', (commandLine) => {
          
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => {
          console.error('Error:', err);
          console.error('FFmpeg stdout:', stdout);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .save(outputPath);
    });
  });
}

// Serve files from the public directory
app.use(express.static(publicDir));

// Add a route for downloading the processed file
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(publicDir, req.params.filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});