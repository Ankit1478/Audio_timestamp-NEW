import React from 'react';
import { Slider } from "./slider";
import { Button } from './button';
import { Play, Pause, Volume2 } from 'lucide-react';

const AudioPlayer = ({
  isPlaying,
  onPlayPause,
  progress,
  mainVolume,
  onMainVolumeChange,
  backgroundTracks,
  onBackgroundVolumeChange,
  currentTime,
  duration,
  onSeek
}) => {
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-100 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <Button onClick={onPlayPause} variant="outline" size="icon">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 mx-4">
          <Slider
            value={[progress]}
            max={100}
            step={0.1}
            onValueChange={(value) => onSeek((value[0] / 100) * duration)}
          />
        </div>
        <div className="text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center">
          <Volume2 className="h-4 w-4 mr-2" />
          <span className="w-20">Main</span>
          <Slider
            className="flex-1"
            value={[mainVolume]}
            max={100}
            step={1}
            onValueChange={(value) => onMainVolumeChange(value[0])}
          />
        </div>
        {backgroundTracks.map((track, index) => (
          <div key={index} className="flex items-center">
            <Volume2 className="h-4 w-4 mr-2" />
            <span className="w-20">BG {index + 1}</span>
            <Slider
              className="flex-1"
              value={[track.volume * 100]}
              max={100}
              step={1}
              onValueChange={(value) => onBackgroundVolumeChange(index, value[0])}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AudioPlayer;