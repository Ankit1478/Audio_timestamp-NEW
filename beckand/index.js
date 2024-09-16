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
    cb(null, file.originalname)
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
    const backgroundMixInputs = [];

    // Get the duration of the main audio file
    ffmpeg.ffprobe(mainAudioPath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err);
        reject(err);
        return;
      }

      const mainDuration = metadata.format.duration;
      console.log('Main audio duration:', mainDuration);

      backgroundAudioFiles.forEach((file, index) => {
        const bgMetadata = backgroundAudioMetadata[index] || {};
        const inputIndex = index + 1;
        const startTime = parseFloat(bgMetadata.timestamp) || 0;
        const volume = Math.min(bgMetadata.volume || 1, 1);

        const specifiedDuration = parseFloat(bgMetadata.duration) || (mainDuration - startTime);
        const endTime = Math.min(startTime + specifiedDuration, mainDuration);
        
        const outputLabel = `bg${inputIndex}`;

        console.log(`Background Audio ${inputIndex}: Start: ${startTime}s, End: ${endTime}s, Volume: ${volume}`);

        filterComplex.push(`[${inputIndex}:a]atrim=${startTime}:${endTime},asetpts=PTS-STARTPTS,volume=${volume},afade=t=out:st=${endTime-startTime-0.5}:d=0.5[${outputLabel}]`);
        filterComplex.push(`[${outputLabel}]adelay=${startTime*1000}|${startTime*1000}[delayed${outputLabel}]`);
        
        backgroundMixInputs.push(`delayed${outputLabel}`);
      });

      // Mix only the background audio streams
      if (backgroundMixInputs.length > 0) {
        filterComplex.push(`${backgroundMixInputs.map(a => `[${a}]`).join('')}amix=inputs=${backgroundMixInputs.length}:dropout_transition=0[bgmix]`);
        
        // Overlay the mixed background onto the main audio with volume control for the main audio
        filterComplex.push(`[0:a]volume=1.0[main];[main][bgmix]amix=inputs=2:normalize=0[out]`);
      } else {
        // If no background audio, just use the main audio with volume control
        filterComplex.push(`[0:a]volume=1.0[out]`);
      }

      command
        .complexFilter(filterComplex, 'out')
        .audioCodec('aac')
        .audioBitrate('128k')
        .toFormat('adts')
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
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

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format);
      }
    });
  });
}

// Update your download route
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