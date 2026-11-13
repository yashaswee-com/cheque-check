'use client'

import { useEffect, useRef, useState } from 'react'
import { Location01Icon as MapPin } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { publicEnv } from '@/lib/env/client'

interface PlacePrediction {
  text: { toString: () => string }
  toPlace: () => {
    formattedAddress?: string
    fetchFields: (options: { fields: string[] }) => Promise<void>
  }
}

interface PlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: {
      input: string
      sessionToken: object
    }) => Promise<{
      suggestions: Array<{ placePrediction?: PlacePrediction }>
    }>
  }
  AutocompleteSessionToken: new () => object
}

interface GoogleMapsApi {
  importLibrary: (name: 'places') => Promise<PlacesLibrary>
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi }
  }
}

let placesLibraryPromise: Promise<PlacesLibrary> | undefined

function loadPlacesLibrary(apiKey: string): Promise<PlacesLibrary> {
  if (window.google?.maps?.importLibrary) {
    return window.google.maps.importLibrary('places')
  }
  if (!placesLibraryPromise) {
    placesLibraryPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(
        'google-maps-places-script',
      ) as HTMLScriptElement | null
      const script = existing ?? document.createElement('script')
      script.addEventListener('load', () => resolve(), { once: true })
      script.addEventListener(
        'error',
        () => reject(new Error('Google Maps failed to load')),
        { once: true },
      )
      if (!existing) {
        script.id = 'google-maps-places-script'
        script.async = true
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=places`
        document.head.appendChild(script)
      }
    })
      .then(async () => {
        const maps = window.google?.maps
        if (!maps) throw new Error('Google Maps is unavailable')
        return maps.importLibrary('places')
      })
      .catch((error: unknown) => {
        placesLibraryPromise = undefined
        document.getElementById('google-maps-places-script')?.remove()
        throw error
      })
  }
  return placesLibraryPromise
}

export interface LocationInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  'data-testid'?: string
  className?: string
  onBlur?: () => void
}

export function LocationInput({
  value,
  onChange,
  placeholder,
  id,
  'data-testid': testId,
  className,
  onBlur,
}: LocationInputProps) {
  const apiKey = publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)
  const [sessionToken, setSessionToken] = useState<object | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const query = value.trim()
    if (!apiKey || query.length < 3) {
      requestId.current += 1
      return
    }

    const id = ++requestId.current
    const timer = window.setTimeout(() => {
      void loadPlacesLibrary(apiKey)
        .then((places) => {
          const token = sessionToken ?? new places.AutocompleteSessionToken()
          if (!sessionToken) setSessionToken(token)
          return places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            sessionToken: token,
          })
        })
        .then(({ suggestions: results }) => {
          if (requestId.current !== id) return
          setSuggestions(
            results.flatMap((result) =>
              result.placePrediction ? [result.placePrediction] : [],
            ),
          )
          setOpen(true)
          setActiveIndex(-1)
        })
        .catch(() => {
          if (requestId.current === id) {
            setSuggestions([])
            setOpen(false)
          }
        })
    }, 300)

    return () => {
      window.clearTimeout(timer)
      requestId.current += 1
    }
  }, [apiKey, sessionToken, value])

  const selectSuggestion = async (prediction: PlacePrediction) => {
    const selectedText = prediction.text.toString()
    setOpen(false)
    setSuggestions([])
    setSessionToken(null)
    onChange(selectedText)
    try {
      const place = prediction.toPlace()
      await place.fetchFields({ fields: ['formattedAddress'] })
      if (place.formattedAddress) onChange(place.formattedAddress)
    } catch {
      // The selected prediction text remains a usable saved location.
    }
  }

  return (
    <div className="relative w-full">
      <Input
        id={id}
        leftIcon={MapPin}
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={testId ? `${testId}-suggestions` : undefined}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(false)
        }}
        onBlur={() => {
          setOpen(false)
          onBlur?.()
        }}
        onFocus={() => {
          if (suggestions.length) setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => (index + 1) % suggestions.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(
              (index) => (index <= 0 ? suggestions.length : index) - 1,
            )
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            void selectSuggestion(suggestions[activeIndex])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {apiKey && value.trim().length >= 3 && open && suggestions.length > 0 && (
        <ul
          id={testId ? `${testId}-suggestions` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {suggestions.map((prediction, index) => (
            <li
              key={`${prediction.text.toString()}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer rounded-sm px-3 py-2 text-sm ${index === activeIndex ? 'bg-muted' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void selectSuggestion(prediction)}
            >
              {prediction.text.toString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
