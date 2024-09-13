"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Howl, Howler } from 'howler';
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Card, CardContent } from "./components/ui/card";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Play, Pause, SkipBack, SkipForward, Upload, Sliders, Volume2, Download } from 'lucide-react';
import { Button } from './components/ui/button';
import AudioPlayer from './components/ui/AudioPlayer'

export default function AudioProcessingApp() {
  const [mainAudio, setMainAudio] = useState(null);
  const [mainVolume, setMainVolume] = useState(100);
  const [backgroundAudios, setBackgroundAudios] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTrack, setActiveTrack] = useState('main');
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const howlRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.unload();
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    if (isPlaying && isAudioLoaded) {
      animationRef.current = requestAnimationFrame(updateProgress);
    } else if (!isPlaying) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, isAudioLoaded]);

  const isAacFile = (file) => {
    return file.type === 'audio/aac' || file.name.toLowerCase().endsWith('.aac');
  };

  const handleMainAudioChange = (e) => {
    const file = e.target.files[0];
    if (file && isAacFile(file)) {
      setMainAudio(file);
      setError('');
    } else {
      setMainAudio(null);
      setError('Please select an AAC file for the main audio.');
    }
  };

  const handleBackgroundAudioChange = (e) => {
    const files = Array.from(e.target.files);
    const aacFiles = files.filter(isAacFile);
    if (aacFiles.length === files.length) {
      setBackgroundAudios(prevAudios => [
        ...prevAudios,
        ...aacFiles.map(file => ({ file, timestamp: 0, volume: 1, duration: 0 }))
      ]);
      setError('');
    } else {
      setError('Please select only AAC files for the background audios.');
    }
  };

  const handleBackgroundAudioUpdate = (index, field, value) => {
    setBackgroundAudios(prevAudios =>
      prevAudios.map((audio, i) =>
        i === index ? { ...audio, [field]: isNaN(value) ? 0 : value } : audio
      )
    );
  };

  const handleSeek = (time) => {
    if (howlRef.current) {
      howlRef.current.seek(time);
      setCurrentTime(time);
    }
  };

  const handleMainVolumeChange = (value) => {
    setMainVolume(value);
    if (howlRef.current) {
      howlRef.current.volume(value / 100);
    }
  };

  const handleBackgroundVolumeChange = (index, value) => {
    handleBackgroundAudioUpdate(index, 'volume', value / 100);
  };

  const handlePlayPause = () => {
    if (howlRef.current) {
      if (isPlaying) {
        howlRef.current.pause();
      } else {
        howlRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const updateProgress = () => {
    if (howlRef.current && isPlaying) {
      const seek = howlRef.current.seek() || 0;
      setCurrentTime(seek);
      setProgress((seek / howlRef.current.duration()) * 100);
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setDownloadUrl('');
    setProgress(0);

    const formData = new FormData();
    formData.append('mainAudio', mainAudio);
    
    const backgroundMetadata = backgroundAudios.map((audio, index) => ({
      index,
      timestamp: audio.timestamp,
      volume: audio.volume,
      duration: audio.duration
    }));

    backgroundAudios.forEach((audio) => {
      formData.append('backgroundAudios', audio.file);
    });

    formData.append('backgroundAudioMetadata', JSON.stringify(backgroundMetadata));

    try {
      const response = await fetch('http://localhost:5001/process', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Processing failed');
        }
        const processedAudioUrl = `http://localhost:5001${data.downloadUrl}`;
        setDownloadUrl(processedAudioUrl);
        
        // Create a new Howl instance with the processed audio
        howlRef.current = new Howl({
          src: [processedAudioUrl],
          format: ['aac'],
          onload: () => {
            setDuration(howlRef.current.duration());
            setIsAudioLoaded(true);
          },
          onplay: () => {
            setIsPlaying(true);
          },
          onpause: () => {
            setIsPlaying(false);
          },
          onstop: () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
          },
          onend: () => {
            setIsPlaying(false);
            setProgress(100);
          },
        });

      } else {
        const text = await response.text();
        console.error('Unexpected response:', text);
        throw new Error('Server returned an unexpected response. Please try again later.');
      }
    } catch (err) {
      console.error('Error details:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Audio Processing App</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">Main Track</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="mainAudio">Upload Main Audio (AAC only)</Label>
                <div className="flex mt-1">
                  <Input id="mainAudio" type="file" accept="audio/aac,.aac" onChange={handleMainAudioChange} />
                  <Button type="button" variant="outline" size="icon" className="ml-2"><Upload className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">Background Tracks</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="backgroundAudios">Upload Background Audios (AAC only)</Label>
                <div className="flex mt-1">
                  <Input id="backgroundAudios" type="file" accept="audio/aac,.aac" multiple onChange={handleBackgroundAudioChange} />
                  <Button type="button" variant="outline" size="icon" className="ml-2"><Upload className="h-4 w-4" /></Button>
                </div>
              </div>
              <Tabs value={activeTrack} onValueChange={setActiveTrack}>
                <TabsList>
                  <TabsTrigger value="main">Main</TabsTrigger>
                  {backgroundAudios.map((_, index) => (
                    <TabsTrigger key={index} value={`bg${index}`}>BG {index + 1}</TabsTrigger>
                  ))}
                </TabsList>
                {activeTrack !== 'main' && (
                  <TabsContent value={activeTrack} className="space-y-4">
                    <div>
                      <Label>Timestamp (s)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={backgroundAudios[parseInt(activeTrack.slice(2))]?.timestamp || 0}
                        onChange={(e) => handleBackgroundAudioUpdate(parseInt(activeTrack.slice(2)), 'timestamp', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Duration (s)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        value={backgroundAudios[parseInt(activeTrack.slice(2))]?.duration || 0}
                        onChange={(e) => handleBackgroundAudioUpdate(parseInt(activeTrack.slice(2)), 'duration', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Volume</Label>
                      <Input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={(backgroundAudios[parseInt(activeTrack.slice(2))]?.volume || 1) * 100}
                        onChange={(e) => handleBackgroundVolumeChange(parseInt(activeTrack.slice(2)), parseInt(e.target.value))}
                      />
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>

      <AudioPlayer
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        progress={progress}
        mainVolume={mainVolume}
        onMainVolumeChange={handleMainVolumeChange}
        backgroundTracks={backgroundAudios}
        onBackgroundVolumeChange={handleBackgroundVolumeChange}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
      />

      <div className="space-y-4">
        <div className="flex justify-center space-x-4">
          <Button onClick={handleSubmit} disabled={!mainAudio || backgroundAudios.length === 0 || processing}>
            <Sliders className="mr-2 h-4 w-4" />
            {processing ? 'Processing...' : 'Process Audio'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {downloadUrl && (
          <Alert>
            <AlertDescription>
              Your audio has been processed successfully.{' '}
              <a href={downloadUrl} download className="font-medium underline">
                Download Processed Audio
              </a>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}